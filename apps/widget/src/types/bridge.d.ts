export interface ToastData {
  changeId: string;
  filePath: string;
  summary: string;
  authorName: string;
  changeKind: string;
}

export interface GuardianBridge {
  getConfig(): Promise<{ token: string | null; serverUrl: string }>;
  getAppVersion(): Promise<string>;
  setToken(token: string): Promise<void>;
  clearToken(): Promise<void>;
  setServerUrl(url: string): Promise<void>;
  getLastSeenChange(): Promise<string | null>;
  bumpLastSeenChange(iso: string): Promise<void>;
  showToast(data: ToastData): Promise<void>;
  toastAction(action: "view" | "dismiss", changeId: string | null): Promise<void>;
  toastResize(height: number): Promise<void>;
  onToastData(cb: (data: ToastData) => void): () => void;
  onOpenChange(cb: (changeId: string) => void): () => void;
  hideWindow(): Promise<void>;
  openExternal(url: string): Promise<void>;
}
declare global { interface Window { guardian: GuardianBridge } }

declare global {
  /** Beim Bauen eingebackene Version der App (electron.vite.config.ts). */
  const __APP_VERSION__: string;
}
