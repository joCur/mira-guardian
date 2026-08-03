import { contextBridge, ipcRenderer } from "electron";

function on<T>(channel: string, cb: (data: T) => void): () => void {
  const listener = (_e: unknown, data: T) => cb(data);
  ipcRenderer.on(channel, listener);
  return () => { ipcRenderer.removeListener(channel, listener); };
}

contextBridge.exposeInMainWorld("guardian", {
  getConfig: () => ipcRenderer.invoke("guardian:getConfig"),
  getAppVersion: () => ipcRenderer.invoke("guardian:getAppVersion"),
  setToken: (token: string) => ipcRenderer.invoke("guardian:setToken", token),
  clearToken: () => ipcRenderer.invoke("guardian:clearToken"),
  setServerUrl: (url: string) => ipcRenderer.invoke("guardian:setServerUrl", url),
  getLastSeenChange: () => ipcRenderer.invoke("guardian:getLastSeenChange"),
  bumpLastSeenChange: (iso: string) => ipcRenderer.invoke("guardian:bumpLastSeenChange", iso),
  showToast: (data: unknown) => ipcRenderer.invoke("guardian:showToast", data),
  toastAction: (action: string, changeId: string | null) => ipcRenderer.invoke("guardian:toastAction", action, changeId),
  toastResize: (height: number) => ipcRenderer.invoke("guardian:toastResize", height),
  onToastData: (cb: (data: unknown) => void) => on("guardian:toastData", cb),
  onOpenChange: (cb: (changeId: string) => void) => on("guardian:openChange", cb),
  hideWindow: () => ipcRenderer.invoke("guardian:hideWindow"),
  openExternal: (url: string) => ipcRenderer.invoke("guardian:openExternal", url),
  getUpdateStatus: () => ipcRenderer.invoke("guardian:getUpdateStatus"),
  checkForUpdate: () => ipcRenderer.invoke("guardian:checkForUpdate"),
  installUpdate: () => ipcRenderer.invoke("guardian:installUpdate"),
  onUpdateStatus: (cb: (s: unknown) => void) => on("guardian:updateStatus", cb),
});
