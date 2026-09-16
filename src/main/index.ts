import { app, BrowserWindow, ipcMain, shell, session } from 'electron'
import { join } from 'path'
import {
  IpcChannel,
  StartWorkflowInput,
  CancelWorkflowInput,
  ResolveApprovalInput,
  GetWorkflowInput
} from '../shared/ipc'
import type { RendererEvent } from '../shared/ipc'
import {
  listWorkflows, getWorkflow, listSteps,
  listTraceEvents, getWorkflowUsage, listPendingApprovals
} from './store'
import { runWorkflow, resumeWorkflow, discoverInterruptedWorkflows, resolveWorkflowApproval } from './workflow'
import { AnthropicProvider } from './model/anthropic'
import { createDefaultRegistry } from './tools/registry'
import { existsSync, mkdirSync } from 'fs'

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

  // CSP — restrictive in production, relaxed in dev for Vite HMR
  const isDev = !!process.env.ELECTRON_RENDERER_URL
  const csp = isDev
    ? "default-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; script-src 'self' 'unsafe-inline' 'unsafe-eval'; connect-src 'self' ws: http: https:"
    : "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; script-src 'self'; connect-src 'self'"

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [csp]
      }
    })
  })

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('http://')) {
      shell.openExternal(url)
    }
    return { action: 'deny' }
  })

  session.defaultSession.setPermissionRequestHandler((_wc, _perm, callback) => {
    callback(false)
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// ── Emit workflow events to renderer ─────────────────────────────

function emitToRenderer(event: RendererEvent): void {
  if (win && !win.isDestroyed()) {
    win.webContents.send(IpcChannel.WORKFLOW_EVENT, event)
  }
}

// ── Demo workspace ───────────────────────────────────────────────

function getDemoWorkspacePath(): string {
  const p = join(app.getPath('userData'), 'demo-workspace')
  if (!existsSync(p)) {
    mkdirSync(p, { recursive: true })
    // Seed with a sample file
    const { writeFileSync } = require('fs')
    writeFileSync(join(p, 'project-notes.md'), `# Project Notes

## Release 1.2
- Feature: Add user preferences panel
- Fix: Resolve timeout in data sync
- Pending: Update API documentation

## Backlog
- Investigate caching strategy
- Review error handling in worker module
- Create onboarding flow for new users
`)
    writeFileSync(join(p, 'README.md'), `# Demo Workspace

This is a demo workspace for Artemis Lite workflow testing.
`)
  }
  return p
}

// ── IPC handlers ─────────────────────────────────────────────────

function registerIpcHandlers(): void {
  ipcMain.handle(IpcChannel.WORKFLOW_START, async (_event, raw: unknown) => {
    const input = StartWorkflowInput.parse(raw)

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY not set. Export it in your environment before running.')
    }

    const model = new AnthropicProvider(apiKey)
    const tools = createDefaultRegistry()
    const workspacePath = getDemoWorkspacePath()

    // Run workflow asynchronously — don't block the IPC response
    const wfPromise = runWorkflow(input.goal, {
      model,
      tools,
      workspacePath,
      emit: emitToRenderer
    })

    // Return immediately with the workflow ID from the first event
    // The orchestrator will emit events as it progresses
    const wf = await wfPromise
    return { id: wf.id, goal: wf.goal, status: wf.status }
  })

  ipcMain.handle(IpcChannel.WORKFLOW_CANCEL, async (_event, raw: unknown) => {
    const input = CancelWorkflowInput.parse(raw)
    // Phase: cancellation support
    return { workflowId: input.workflowId, status: 'cancelled' as const }
  })

  ipcMain.handle(IpcChannel.WORKFLOW_LIST, async () => {
    return listWorkflows().map(w => ({
      id: w.id,
      goal: w.goal,
      status: w.status,
      createdAt: w.createdAt,
      updatedAt: w.updatedAt
    }))
  })

  ipcMain.handle(IpcChannel.WORKFLOW_GET, async (_event, raw: unknown) => {
    const input = GetWorkflowInput.parse(raw)
    const wf = getWorkflow(input.workflowId)
    if (!wf) return { workflowId: input.workflowId, workflow: null, steps: [] }
    const steps = listSteps(wf.id)
    return {
      workflowId: wf.id,
      workflow: wf,
      steps: steps.map(s => ({
        id: s.id,
        workflowId: s.workflowId,
        type: s.type,
        status: s.status,
        attempt: s.attempt,
        toolName: s.toolName,
        outputData: s.outputData,
        startedAt: s.startedAt,
        completedAt: s.completedAt
      }))
    }
  })

  ipcMain.handle(IpcChannel.WORKFLOW_TRACE, async (_event, raw: unknown) => {
    const input = GetWorkflowInput.parse(raw)
    return { workflowId: input.workflowId, events: listTraceEvents(input.workflowId) }
  })

  ipcMain.handle(IpcChannel.WORKFLOW_USAGE, async (_event, raw: unknown) => {
    const input = GetWorkflowInput.parse(raw)
    return { workflowId: input.workflowId, usage: getWorkflowUsage(input.workflowId) }
  })

  ipcMain.handle(IpcChannel.APPROVAL_RESOLVE, async (_event, raw: unknown) => {
    const input = ResolveApprovalInput.parse(raw)
    resolveWorkflowApproval(input.approvalId, input.decision)
    return { approvalId: input.approvalId, decision: input.decision }
  })

  ipcMain.handle(IpcChannel.APPROVAL_LIST, async () => {
    return listPendingApprovals()
  })

  ipcMain.handle(IpcChannel.WORKFLOW_INTERRUPTED, async () => {
    return discoverInterruptedWorkflows().map(w => ({
      id: w.id,
      goal: w.goal,
      status: w.status,
      createdAt: w.createdAt,
      updatedAt: w.updatedAt
    }))
  })

  ipcMain.handle(IpcChannel.WORKFLOW_RESUME, async (_event, raw: unknown) => {
    const input = GetWorkflowInput.parse(raw)

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY not set.')
    }

    const model = new AnthropicProvider(apiKey)
    const tools = createDefaultRegistry()
    const workspacePath = getDemoWorkspacePath()

    const wf = await resumeWorkflow(input.workflowId, {
      model,
      tools,
      workspacePath,
      emit: emitToRenderer
    })
    return { id: wf.id, goal: wf.goal, status: wf.status }
  })
}

// ── App lifecycle ────────────────────────────────────────────────

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
