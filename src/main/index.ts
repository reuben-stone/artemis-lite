import { app, BrowserWindow, ipcMain, shell, session, dialog } from 'electron'
import { join, basename } from 'path'
import {
  IpcChannel,
  StartWorkflowInput,
  CancelWorkflowInput,
  ResolveApprovalInput,
  GetWorkflowInput,
  AddProjectInput,
  RemoveProjectInput,
  SetActiveProjectInput
} from '../shared/ipc'
import type { RendererEvent } from '../shared/ipc'
import {
  listWorkflows, getWorkflow, listSteps,
  listTraceEvents, getWorkflowUsage, listPendingApprovals, listContextPackets,
  createProject, getProject, listProjects, removeProject,
  getActiveProject, getActiveProjectId, setActiveProjectId,
  getProjectByPath
} from './store'
import { runWorkflow, resumeWorkflow, discoverInterruptedWorkflows, resolveWorkflowApproval } from './workflow'
import { AnthropicProvider } from './model/anthropic'
import { createDefaultRegistry } from './tools/registry'
import { InjectableFaultInjector, type FaultType } from './fault-injector'
import { getGitRemote, getGitStatus } from './git'
import { existsSync } from 'fs'

let win: BrowserWindow | null = null

// Singleton fault injector for the app lifetime
const faultInjector = new InjectableFaultInjector({
  onArmed: (fault) => {
    // Trace armed faults (will be associated with next workflow)
    console.log(`[Failure Lab] Armed: ${fault}`)
  },
  onTriggered: (fault) => {
    console.log(`[Failure Lab] Triggered: ${fault}`)
  }
})

function createWindow(): void {
  win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    title: 'Artemis Lite',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
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

// ── Resolve active project workspace ─────────────────────────────

function requireActiveProject(): { projectId: string; workspacePath: string } {
  const project = getActiveProject()
  if (!project) throw new Error('No active project. Register a repository first.')
  if (!existsSync(project.path)) throw new Error(`Project path does not exist: ${project.path}`)
  return { projectId: project.id, workspacePath: project.path }
}

function requireApiKey(): string {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set. Export it in your environment before running.')
  return apiKey
}

// ── IPC handlers ─────────────────────────────────────────────────

function registerIpcHandlers(): void {

  // ── Project handlers ────────────────────────────────────────────

  ipcMain.handle(IpcChannel.PROJECT_LIST, async () => {
    const projects = listProjects()
    const activeId = getActiveProjectId()
    const results = []
    for (const p of projects) {
      const status = await getGitStatus(p.path).catch(() => ({ branch: null, dirty: false }))
      results.push({
        id: p.id,
        name: p.name,
        path: p.path,
        remote: p.remote,
        branch: (status as any).branch ?? null,
        dirty: (status as any).dirty ?? false,
        active: p.id === activeId,
        createdAt: p.createdAt
      })
    }
    return results
  })

  ipcMain.handle(IpcChannel.PROJECT_ADD, async (_event, raw: unknown) => {
    const input = AddProjectInput.parse(raw)
    const path = input.path

    // Check if already registered
    const existing = getProjectByPath(path)
    if (existing) {
      setActiveProjectId(existing.id)
      return { project: existing, created: false }
    }

    const name = basename(path)
    const remote = await getGitRemote(path).catch(() => null)
    const project = createProject(name, path, remote)

    // Auto-activate if first project
    if (!getActiveProjectId()) {
      setActiveProjectId(project.id)
    }

    return { project, created: true }
  })

  ipcMain.handle(IpcChannel.PROJECT_REMOVE, async (_event, raw: unknown) => {
    const input = RemoveProjectInput.parse(raw)
    removeProject(input.projectId)
    return { removed: true }
  })

  ipcMain.handle(IpcChannel.PROJECT_SET_ACTIVE, async (_event, raw: unknown) => {
    const input = SetActiveProjectInput.parse(raw)
    const project = getProject(input.projectId)
    if (!project) throw new Error(`Project ${input.projectId} not found`)
    setActiveProjectId(input.projectId)
    return { projectId: input.projectId }
  })

  ipcMain.handle(IpcChannel.PROJECT_GET_ACTIVE, async () => {
    const project = getActiveProject()
    if (!project) return null
    const status = await getGitStatus(project.path).catch(() => ({ branch: null, dirty: false }))
    return {
      id: project.id,
      name: project.name,
      path: project.path,
      remote: project.remote,
      branch: (status as any).branch ?? null,
      dirty: (status as any).dirty ?? false,
      createdAt: project.createdAt
    }
  })

  // ── Workflow handlers ───────────────────────────────────────────

  ipcMain.handle(IpcChannel.WORKFLOW_START, async (_event, raw: unknown) => {
    const input = StartWorkflowInput.parse(raw)
    const apiKey = requireApiKey()
    const { projectId, workspacePath } = requireActiveProject()

    const model = new AnthropicProvider(apiKey)
    const tools = createDefaultRegistry()

    const wf = await runWorkflow(input.goal, {
      model,
      tools,
      workspacePath,
      emit: emitToRenderer,
      faultInjector
    }, projectId)

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

  ipcMain.handle(IpcChannel.WORKFLOW_CONTEXT, async (_event, raw: unknown) => {
    const input = GetWorkflowInput.parse(raw)
    return { workflowId: input.workflowId, packets: listContextPackets(input.workflowId) }
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
    const apiKey = requireApiKey()

    // Resolve the project from the workflow's persisted projectId
    const wfRow = getWorkflow(input.workflowId)
    if (!wfRow) throw new Error(`Workflow ${input.workflowId} not found`)

    let workspacePath: string
    if (wfRow.projectId) {
      const project = getProject(wfRow.projectId)
      if (!project) throw new Error(`Project ${wfRow.projectId} no longer exists — cannot recover workflow`)
      if (!existsSync(project.path)) throw new Error(`Project path does not exist: ${project.path}`)
      workspacePath = project.path
    } else {
      // Legacy workflow without a project — try active project as fallback
      const active = getActiveProject()
      if (!active) throw new Error('Workflow has no project and no active project is set')
      workspacePath = active.path
    }

    const model = new AnthropicProvider(apiKey)
    const tools = createDefaultRegistry()

    const wf = await resumeWorkflow(input.workflowId, {
      model,
      tools,
      workspacePath,
      emit: emitToRenderer,
      faultInjector
    })
    return { id: wf.id, goal: wf.goal, status: wf.status }
  })

  ipcMain.handle(IpcChannel.FAULT_ARM, async (_event, raw: unknown) => {
    const { fault } = raw as { fault: string }
    faultInjector.arm(fault as FaultType)
    return { armed: faultInjector.listArmed() }
  })

  ipcMain.handle(IpcChannel.FAULT_LIST, async () => {
    return { armed: faultInjector.listArmed() }
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
