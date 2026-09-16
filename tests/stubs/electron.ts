// Minimal Electron shim for vitest — tests run in plain Node, not Electron
export const app = {
  whenReady: () => Promise.resolve(),
  on: () => {},
  quit: () => {}
}
export const BrowserWindow = class {
  webContents = { send: () => {} }
  loadURL() {}
  loadFile() {}
}
export const ipcMain = {
  handle: () => {},
  on: () => {}
}
export const ipcRenderer = {
  invoke: () => Promise.resolve(),
  on: () => {},
  removeListener: () => {}
}
export const contextBridge = {
  exposeInMainWorld: () => {}
}
export const shell = { openExternal: () => {} }
export const session = {
  defaultSession: {
    webRequest: { onHeadersReceived: () => {} },
    setPermissionRequestHandler: () => {}
  }
}
