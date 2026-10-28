const callbacks = new Set<(event: any) => void>();
export const invoke = async () => undefined;
export const listen = async () => () => { };
export const open = async () => null;
export const getCurrentWindow = () => ({ onCloseRequested: async () => () => { } });
export const getCurrentWebview = () => ({ onDragDropEvent: async (callback: (event: any) => void) => { callbacks.add(callback); return () => callbacks.delete(callback); } });
(window as any).dropFixture = (payload: any) => callbacks.forEach(callback => callback({ payload }));
