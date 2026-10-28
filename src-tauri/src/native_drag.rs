//! macOS file promises: Finder supplies the destination, then ADB writes it.
//! No temporary download is needed simply to begin a drag.
use crate::{adb::transfer, models::FileEntry};
use objc2::{
    define_class, msg_send,
    rc::Retained,
    runtime::{AnyObject, ProtocolObject},
    AnyThread, DefinedClass, MainThreadOnly,
};
use objc2_app_kit::{
    NSDragOperation, NSDraggingContext, NSDraggingItem, NSDraggingSession, NSDraggingSource,
    NSEvent, NSEventType, NSFilePromiseProvider, NSFilePromiseProviderDelegate, NSImage, NSView,
};
use objc2_foundation::{
    ns_string, MainThreadMarker, NSArray, NSDictionary, NSError, NSObject, NSObjectProtocol,
    NSOperationQueue, NSPoint, NSProcessInfo, NSRect, NSSize, NSString, NSURL,
};
use std::{cell::RefCell, path::Path, sync::Arc};
use tauri::Emitter;

// Bound ADB subprocess concurrency even when Finder requests many promises.
static PROMISE_QUEUE: std::sync::LazyLock<Retained<NSOperationQueue>> =
    std::sync::LazyLock::new(|| {
        let queue = NSOperationQueue::new();
        queue.setMaxConcurrentOperationCount(2);
        queue
    });

struct PromiseData {
    app: tauri::AppHandle,
    serial: String,
    entry: FileEntry,
    batch: Arc<transfer::BatchGuard>,
}

define_class!(
    // SAFETY: NSObject permits subclassing. Ivars own their Rust data and have
    // no reference back to the provider, so retaining userInfo creates no cycle.
    #[unsafe(super = NSObject)]
    #[name = "AFTFilePromiseDelegate"]
    #[ivars = PromiseData]
    struct PromiseDelegate;
    unsafe impl NSObjectProtocol for PromiseDelegate {}
    // SAFETY: All method signatures match NSFilePromiseProviderDelegate.
    unsafe impl NSFilePromiseProviderDelegate for PromiseDelegate {
        #[unsafe(method_id(filePromiseProvider:fileNameForType:))]
        fn filename(&self, _: &NSFilePromiseProvider, _: &NSString) -> Retained<NSString> {
            NSString::from_str(&self.ivars().entry.name)
        }
        #[unsafe(method_id(operationQueueForFilePromiseProvider:))]
        fn queue(&self, _: &NSFilePromiseProvider) -> Retained<NSOperationQueue> {
            // Promise fulfillment must never block AppKit's main queue.
            PROMISE_QUEUE.clone()
        }
        #[unsafe(method(filePromiseProvider:writePromiseToURL:completionHandler:))]
        fn write(
            &self,
            _: &NSFilePromiseProvider,
            url: &NSURL,
            completion: &block2::DynBlock<dyn Fn(*mut NSError)>,
        ) {
            let data = self.ivars();
            let result: Result<(), String> = (|| {
                let destination = url
                    .path()
                    .ok_or("Finder did not supply a destination")?
                    .to_string();
                let path = Path::new(&destination);
                let parent = path
                    .parent()
                    .and_then(|p| p.to_str())
                    .ok_or("Invalid destination folder")?;
                let name = path
                    .file_name()
                    .and_then(|p| p.to_str())
                    .ok_or("Invalid destination name")?;
                let result = tauri::async_runtime::block_on(transfer::download_files_in_batch(
                    &data.serial,
                    vec![data.entry.path.clone()],
                    parent,
                    "replace",
                    transfer::DownloadTarget {
                        name: Some(name),
                        preview: false,
                    },
                    data.app.clone(),
                    data.batch.clone(),
                ))?;
                if result.completed == 1 {
                    Ok(())
                } else {
                    Err("Download failed or was cancelled; see the transfer drawer".into())
                }
            })();
            match result {
                Ok(()) => completion.call((std::ptr::null_mut(),)),
                Err(message) => {
                    let description = NSString::from_str(&message);
                    let info: Retained<NSDictionary<NSString, AnyObject>> =
                        NSDictionary::from_slices(
                            &[ns_string!("NSLocalizedDescription")],
                            &[&*description],
                        );
                    // SAFETY: Keys and values are valid Foundation objects, and
                    // NSError retains the dictionary for the duration of call.
                    let error = unsafe {
                        NSError::errorWithDomain_code_userInfo(ns_string!("Pico"), 1, Some(&info))
                    };
                    completion.call((Retained::as_ptr(&error).cast_mut(),));
                }
            }
        }
    }
);

impl PromiseDelegate {
    fn new(data: PromiseData) -> Retained<Self> {
        let this = Self::alloc().set_ivars(data);
        // SAFETY: NSObject's initializer is valid for this subclass.
        unsafe { msg_send![super(this), init] }
    }
}

struct SourceData {
    app: tauri::AppHandle,
}
thread_local! { static SOURCE: RefCell<Option<Retained<DragSource>>> = const { RefCell::new(None) }; }
define_class!(
    // SAFETY: AppKit source callbacks and storage are confined to the main thread.
    #[unsafe(super = NSObject)]
    #[thread_kind = MainThreadOnly]
    #[name = "AFTDraggingSource"]
    #[ivars = SourceData]
    struct DragSource;
    unsafe impl NSObjectProtocol for DragSource {}
    // SAFETY: The signatures match NSDraggingSource's main-thread callbacks.
    unsafe impl NSDraggingSource for DragSource {
        #[unsafe(method(draggingSession:sourceOperationMaskForDraggingContext:))]
        fn operations(&self, _: &NSDraggingSession, context: NSDraggingContext) -> NSDragOperation {
            if context == NSDraggingContext::OutsideApplication {
                NSDragOperation::Copy
            } else {
                NSDragOperation::None
            }
        }
        #[unsafe(method(draggingSession:endedAtPoint:operation:))]
        fn ended(&self, _: &NSDraggingSession, _: NSPoint, _: NSDragOperation) {
            let app = self.ivars().app.clone();
            // Release after this callback returns. Providers independently retain
            // promise delegates until Finder finishes writing the received files.
            let cleanup_app = app.clone();
            let _ = app.run_on_main_thread(move || {
                SOURCE.with(|source| source.borrow_mut().take());
                let _ = cleanup_app.emit("native-drag-ended", ());
            });
        }
    }
);

pub async fn start(
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
    serial: String,
    entries: Vec<FileEntry>,
) -> Result<(), String> {
    if entries.is_empty() {
        return Err("No files selected".into());
    }
    for entry in &entries {
        let path = Path::new(&entry.path);
        if !path.is_absolute()
            || path.file_name().and_then(|n| n.to_str()) != Some(&entry.name)
            || entry.name.contains('\0')
            || entry.name == "."
            || entry.name == ".."
        {
            return Err("Invalid drag filename".into());
        }
    }
    let batch = Arc::new(transfer::BatchGuard::new());
    let (sender, receiver) = tokio::sync::oneshot::channel();
    window.with_webview(move |webview| {
        let result: Result<(), String> = (|| {
            let mtm = MainThreadMarker::new().ok_or("Drag must begin on the main thread")?;
            if NSEvent::pressedMouseButtons() & 1 == 0 { return Err("Keep the mouse button pressed while dragging".into()); }
            if SOURCE.with(|s| s.borrow().is_some()) { return Err("A drag is already active".into()); }
            // SAFETY: Tauri supplies a live WKWebView (an NSView subclass). The
            // borrow stays inside with_webview and never leaves the main thread.
            let view = unsafe { &*webview.inner().cast::<NSView>() };
            let window = view.window().ok_or("Window unavailable")?;
            let location = window.mouseLocationOutsideOfEventStream();
            let event = NSEvent::mouseEventWithType_location_modifierFlags_timestamp_windowNumber_context_eventNumber_clickCount_pressure(
                NSEventType::LeftMouseDragged, location, NSEvent::modifierFlags_class(), NSProcessInfo::processInfo().systemUptime(), window.windowNumber(), None, 0, 1, 1.0,
            ).ok_or("Cannot create drag event")?;
            let source = DragSource::alloc(mtm).set_ivars(SourceData { app: app.clone() });
            // SAFETY: NSObject's initializer is valid for the source subclass.
            let source: Retained<DragSource> = unsafe { msg_send![super(source), init] };
            let point = view.convertPoint_fromView(location, None);
            let mut items = Vec::with_capacity(entries.len());
            for (index, entry) in entries.into_iter().enumerate() {
                let is_directory = entry.is_directory;
                let delegate = PromiseDelegate::new(PromiseData { app: app.clone(), serial: serial.clone(), entry, batch: batch.clone() });
                let kind = if is_directory { ns_string!("public.folder") } else { ns_string!("public.data") };
                let provider = NSFilePromiseProvider::initWithFileType_delegate(NSFilePromiseProvider::alloc(), kind, ProtocolObject::from_ref(&*delegate));
                // SAFETY: userInfo strongly retains the otherwise weak delegate.
                // The delegate does not retain the provider, so there is no cycle.
                unsafe { provider.setUserInfo(Some(&delegate)); }
                let item = NSDraggingItem::initWithPasteboardWriter(NSDraggingItem::alloc(), ProtocolObject::from_ref(&*provider));
                let icon = NSImage::imageNamed(if is_directory { ns_string!("NSFolder") } else { ns_string!("NSMultipleDocuments") }).ok_or("Drag icon unavailable")?;
                // SAFETY: NSImage is a supported dragging item contents object.
                unsafe { item.setDraggingFrame_contents(NSRect::new(NSPoint::new(point.x + index.min(4) as f64 * 4.0, point.y - 24.0), NSSize::new(32.0, 32.0)), Some(&icon)); }
                items.push(item);
            }
            let items = NSArray::from_retained_slice(&items);
            SOURCE.with(|s| *s.borrow_mut() = Some(source.clone()));
            view.beginDraggingSessionWithItems_event_source(&items, &event, ProtocolObject::from_ref(&*source));
            Ok(())
        })();
        let _ = sender.send(result);
    }).map_err(|e| e.to_string())?;
    receiver.await.map_err(|e| e.to_string())?
}
