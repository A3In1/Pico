/** Maps file_type to an SVG icon (inline) */
export function getFileIcon(fileType: string): string {
  switch (fileType) {
    case "folder":
      return "📁";
    case "image":
      return "🖼️";
    case "video":
      return "🎬";
    case "audio":
      return "🎵";
    case "document":
      return "📄";
    case "archive":
      return "📦";
    case "apk":
      return "📱";
    default:
      return "📋";
  }
}

/** Returns a CSS color for the file type icon background */
export function getFileTypeColor(fileType: string): string {
  switch (fileType) {
    case "folder":
      return "rgba(77, 142, 255, 0.12)";
    case "image":
      return "rgba(255, 107, 107, 0.12)";
    case "video":
      return "rgba(168, 85, 247, 0.12)";
    case "audio":
      return "rgba(34, 197, 94, 0.12)";
    case "document":
      return "rgba(59, 130, 246, 0.12)";
    case "archive":
      return "rgba(245, 158, 11, 0.12)";
    case "apk":
      return "rgba(52, 211, 153, 0.12)";
    default:
      return "rgba(148, 163, 184, 0.12)";
  }
}
