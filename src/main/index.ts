import { app, BrowserWindow, ipcMain, shell, session } from 'electron'
import { join } from 'path'
import {
  IpcChannel,
  StartWorkflowInput,
  CancelWorkflowInput,
  ResolveApprovalInput,
  GetWorkflowInput
} from '../shared/ipc'

let win: BrowserWindow | null = null

function createWindow(): void {
  win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    title: 'Artemis Lite',
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  // CSP — restrictive; no remote scripts, no eval, no inline scripts
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; script-src 'self'; connect-src 'self'"
        ]
      }
    })
  })

  // Block new windows; open external links in system browser
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('http://')) {
      shell.openExternal(url)
    }
    return { action: 'deny' }
  })

  // Deny all permission requests (no mic/camera/etc needed for Lite)
  session.defaultSession.setPermissionRequestHandler((_wc, _perm, callback) => {
    callback(false)
  })

  // Load renderer
  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// ── IPC handlers ─────────────────────────────────────────────────────

function registerIpcHandlers(): void {
  ipcMain.handle(IpcChannel.WORKFLOW_START, async (_event, raw: unknown) => {
    const input = StartWorkflowInput.parse(raw)
    // Phase 2: wire to workflow service
    return { id: crypto.randomUUID(), goal: input.goal, status: 'queued' as const }
  })

  ipcMain.handle(IpcChannel.WORKFLOW_CANCEL, async (_event, raw: unknown) => {
    const input = CancelWorkflowInput.parse(raw)
    // Phase 2: wire to workflow service
    return { workflowId: input.workflowId, status: 'cancelled' as const }
  })

  ipcMain.handle(IpcChannel.WORKFLOW_LIST, async () => {
    // Phase 2: return from persistence
    return []
  })

  ipcMain.handle(IpcChannel.WORKFLOW_GET, async (_event, raw: unknown) => {
    const input = GetWorkflowInput.parse(raw)
    // Phase 2: return from persistence
    return { workflowId: input.workflowId, workflow: null }
  })

  ipcMain.handle(IpcChannel.WORKFLOW_TRACE, async (_event, raw: unknown) => {
    const input = GetWorkflowInput.parse(raw)
    // Phase 2: return trace events
    return { workflowId: input.workflowId, events: [] }
  })

  ipcMain.handle(IpcChannel.WORKFLOW_USAGE, async (_event, raw: unknown) => {
    const input = GetWorkflowInput.parse(raw)
    // Phase 2: return usage summary
    return {
      workflowId: input.workflowId,
      usage: {
        modelCalls: 0,
        inputTokens: 0,
        outputTokens: 0,
        estimatedCost: 0,
        toolCalls: 0,
        retries: 0,
        durationMs: 0
      }
    }
  })

  ipcMain.handle(IpcChannel.APPROVAL_RESOLVE, async (_event, raw: unknown) => {
    const input = ResolveApprovalInput.parse(raw)
    // Phase 2: resolve approval in workflow service
    return { approvalId: input.approvalId, decision: input.decision }
  })

  ipcMain.handle(IpcChannel.APPROVAL_LIST, async () => {
    // Phase 2: return pending approvals
    return []
  })
}

// ── App lifecycle ────────────────────────────────────────────────────

app.whenReady().then(() => {
  registerIpcHandlers()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
