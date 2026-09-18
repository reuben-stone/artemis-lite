import { loadDotenv, getAppConfig } from './env'

// Load .env before anything else reads process.env.
// app.getAppPath() isn't available yet, but the working directory
// is the project root when launched via `electron-vite dev` or `electron .`
loadDotenv(process.cwd())

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
  listWorkflows, getWorkflow, listSteps, deleteWorkflow,
  listTraceEvents, getWorkflowUsage, listPendingApprovals, listContextPackets,
  createProject, getProject, listProjects, removeProject,
  getActiveProject, getActiveProjectId, setActiveProjectId,
  getProjectByPath, updateProjectGitHub, updateProjectIntegrations, getWorkflowResult,
  getDb, createWorkflow
} from './store'
import { runWorkflow, resumeWorkflow, discoverInterruptedWorkflows, resolveWorkflowApproval } from './workflow'
import { AnthropicProvider } from './model/anthropic'
import { createDefaultRegistry } from './tools/registry'
import type { ToolContext } from './tools/registry'
import { InjectableFaultInjector, type FaultType } from './fault-injector'
import { getGitRemote, getGitStatus } from './git'
import { GitHubClient, parseGitHubRemote } from './github'
import type { GitHubIdentity } from './github-types'
import { Scheduler } from './scheduler'
import { createSentryClient } from './sentry'
import { createAnalyticsClient } from './analytics'
import { setSecret, hasSecret, clearSecret, requireAnthropicKey as requireKey, getGitHubToken } from './secrets'
import { existsSync } from 'fs'

let win: BrowserWindow | null = null
let scheduler: Scheduler | null = null

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

// requireKey() and getGitHubToken() from ./secrets; getAppConfig() from ./env

/**
 * Build ToolContext for the active project, including GitHub client if available.
 */
function buildToolContext(workspacePath: string): ToolContext {
  const ctx: ToolContext = { workspacePath }
  const ghToken = getGitHubToken()
  if (ghToken) {
    ctx.githubClient = new GitHubClient(ghToken)
    // Resolve GitHub identity from active project
    const project = getActiveProject()
    if (project?.githubOwner && project?.githubRepo) {
      ctx.githubIdentity = { owner: project.githubOwner, repo: project.githubRepo }
    } else if (project?.remote) {
      // Backfill: project was added before Phase 4 — parse and persist now
      const identity = parseGitHubRemote(project.remote)
      if (identity) {
        updateProjectGitHub(project.id, identity.owner, identity.repo)
        ctx.githubIdentity = identity
      }
    }
  }
  return ctx
}

/**
 * Parse GitHub identity from a git remote URL and persist it to the project.
 */
function resolveAndPersistGitHub(projectId: string, remote: string | null): void {
  if (!remote) return
  const identity = parseGitHubRemote(remote)
  if (identity) {
    updateProjectGitHub(projectId, identity.owner, identity.repo)
  }
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
        sentryProject: p.sentryProject ?? null,
        gaPropertyId: p.gaPropertyId ?? null,
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
    const github = remote ? parseGitHubRemote(remote) : null
    const project = createProject(name, path, remote, github)

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

  ipcMain.handle(IpcChannel.PROJECT_PICK_FOLDER, async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
      title: 'Select a repository folder'
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
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
      sentryProject: project.sentryProject ?? null,
      gaPropertyId: project.gaPropertyId ?? null,
      createdAt: project.createdAt
    }
  })

  ipcMain.handle(IpcChannel.PROJECT_UPDATE_INTEGRATIONS, async (_event, raw: unknown) => {
    const input = raw as { projectId: string; sentryProject?: string; gaPropertyId?: string }
    updateProjectIntegrations(input.projectId, {
      sentryProject: input.sentryProject,
      gaPropertyId: input.gaPropertyId
    })
    return { updated: true }
  })

  // ── Workflow handlers ───────────────────────────────────────────

  ipcMain.handle(IpcChannel.WORKFLOW_START, async (_event, raw: unknown) => {
    const input = StartWorkflowInput.parse(raw)
    const apiKey = requireKey()
    const config = getAppConfig()
    const { projectId, workspacePath } = requireActiveProject()

    // Create the workflow row synchronously so we can return the real ID immediately
    const wfRow = createWorkflow(input.goal, projectId)

    // Run execution in background — events stream to renderer via emitToRenderer
    const model = new AnthropicProvider(apiKey, config.anthropicModel)
    const tools = createDefaultRegistry()
    const toolCtx = buildToolContext(workspacePath)

    runWorkflow(input.goal, {
      model,
      tools,
      workspacePath,
      toolContext: toolCtx,
      emit: emitToRenderer,
      faultInjector
    }, projectId, wfRow.id).catch(err => {
      console.error('[Workflow] Background execution failed:', err)
    })

    // Return immediately so the renderer has the real ID for event matching
    return { id: wfRow.id, goal: wfRow.goal, status: wfRow.status }
  })

  ipcMain.handle(IpcChannel.WORKFLOW_CANCEL, async (_event, raw: unknown) => {
    const input = CancelWorkflowInput.parse(raw)
    return { workflowId: input.workflowId, status: 'cancelled' as const }
  })

  ipcMain.handle(IpcChannel.WORKFLOW_DELETE, async (_event, raw: unknown) => {
    const input = GetWorkflowInput.parse(raw)
    deleteWorkflow(input.workflowId)
    return { deleted: true }
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
        inputData: s.inputData,
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

  ipcMain.handle(IpcChannel.WORKFLOW_RESULT, async (_event, raw: unknown) => {
    const input = GetWorkflowInput.parse(raw)
    const result = getWorkflowResult(input.workflowId)
    return { workflowId: input.workflowId, result: result ?? null }
  })

  ipcMain.handle(IpcChannel.WORKFLOW_PUBLISH_PR, async (_event, raw: unknown) => {
    const { workflowId } = raw as { workflowId: string }
    const wf = getWorkflow(workflowId)
    if (!wf) throw new Error('Workflow not found')

    // Find the delegation step output
    const steps = listSteps(workflowId)
    const delegateStep = steps.find(s => s.toolName === 'delegate_engineering' && s.status === 'completed')
    if (!delegateStep?.outputData) throw new Error('No completed delegation step found')

    const delegateResult = JSON.parse(delegateStep.outputData)
    const observed = delegateResult.observed
    if (!observed?.diff?.files?.length) throw new Error('No changes to publish')

    // Get project GitHub identity
    const project = getActiveProject()
    if (!project?.githubOwner || !project?.githubRepo) throw new Error('Project has no GitHub identity')

    const ghToken = getGitHubToken()
    if (!ghToken) throw new Error('GitHub token not configured')

    const { publishWorkflowPR } = await import('./delegate/claude-code')
    const result = await publishWorkflowPR({
      workflowId,
      worktreePath: observed.worktreePath,
      branchName: observed.branchName,
      baseCommit: observed.baseCommit,
      goal: wf.goal,
      engineOutput: delegateResult.engine?.output ?? '',
      diff: observed.diff,
      checks: observed.checks.map((c: any) => ({ check: c.check, passed: c.passed, skipped: c.skipped })),
      hasUncommittedChanges: observed.gitState?.hasUncommittedChanges ?? false,
      githubOwner: project.githubOwner,
      githubRepo: project.githubRepo,
      githubToken: ghToken
    })

    // Clean up worktree after successful publication
    try {
      const { removeWorktree } = await import('./delegate/claude-code')
      await removeWorktree(project.path, observed.worktreePath, observed.branchName)
    } catch { /* best effort */ }

    return result
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
    const apiKey = requireKey()
    const config = getAppConfig()

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

    const model = new AnthropicProvider(apiKey, config.anthropicModel)
    const tools = createDefaultRegistry()
    const toolCtx = buildToolContext(workspacePath)

    const wf = await resumeWorkflow(input.workflowId, {
      model,
      tools,
      workspacePath,
      toolContext: toolCtx,
      emit: emitToRenderer,
      faultInjector
    })
    return { id: wf.id, goal: wf.goal, status: wf.status }
  })

  // ── Sentry + Analytics handlers ─────────────────────────────────

  ipcMain.handle(IpcChannel.SENTRY_ISSUES, async (_event, raw: unknown) => {
    const { projectSlug } = raw as { projectSlug: string }
    const client = createSentryClient()
    if (!client) return { issues: [], error: 'Sentry not configured' }
    try {
      const issues = await client.listIssues(projectSlug)
      return { issues }
    } catch (err: any) {
      return { issues: [], error: err.message }
    }
  })

  ipcMain.handle(IpcChannel.ANALYTICS_SUMMARY, async (_event, raw: unknown) => {
    const { propertyId, label } = raw as { propertyId: string; label: string }
    const client = createAnalyticsClient()
    if (!client) return { summary: null, error: 'Google Analytics not configured' }
    try {
      const summary = await client.getPropertySummary(propertyId, label)
      return { summary }
    } catch (err: any) {
      return { summary: null, error: err.message }
    }
  })

  ipcMain.handle(IpcChannel.GITHUB_PROJECT_PRS, async (_event, raw: unknown) => {
    const { owner, repo } = raw as { owner: string; repo: string }
    const token = getGitHubToken()
    if (!token) return { pullRequests: [], error: 'GitHub not configured' }
    try {
      const { GitHubClient } = require('./github')
      const client = new GitHubClient(token)
      const prs = await client.listPullRequests({ owner, repo }, { state: 'open' })
      return { pullRequests: prs }
    } catch (err: any) {
      return { pullRequests: [], error: err.message }
    }
  })

  // ── Secret handlers (set/has/clear - never expose actual value) ──

  ipcMain.handle(IpcChannel.SECRET_SET, async (_event, raw: unknown) => {
    const { name, value } = raw as { name: string; value: string }
    setSecret(name as any, value)
    return { set: true }
  })

  ipcMain.handle(IpcChannel.SECRET_HAS, async (_event, raw: unknown) => {
    const { name } = raw as { name: string }
    return { has: hasSecret(name as any) }
  })

  ipcMain.handle(IpcChannel.SECRET_CLEAR, async (_event, raw: unknown) => {
    const { name } = raw as { name: string }
    clearSecret(name as any)
    return { cleared: true }
  })

  // ── Scheduler handlers ──────────────────────────────────────────

  ipcMain.handle(IpcChannel.SCHEDULE_LIST, async () => {
    return scheduler?.listSchedules() ?? []
  })

  ipcMain.handle(IpcChannel.SCHEDULE_ADD, async (_event, raw: unknown) => {
    const input = raw as { name: string; goal: string; cronHour: number; cronMinute: number; projectId?: string }
    if (!scheduler) throw new Error('Scheduler not initialized')
    return scheduler.addSchedule(input.name, input.goal, input.cronHour, input.cronMinute, input.projectId)
  })

  ipcMain.handle(IpcChannel.SCHEDULE_REMOVE, async (_event, raw: unknown) => {
    const { scheduleId } = raw as { scheduleId: string }
    scheduler?.removeSchedule(scheduleId)
    return { removed: true }
  })

  ipcMain.handle(IpcChannel.SCHEDULE_TOGGLE, async (_event, raw: unknown) => {
    const { scheduleId, enabled } = raw as { scheduleId: string; enabled: boolean }
    scheduler?.toggleSchedule(scheduleId, enabled)
    return { toggled: true }
  })

  // ── Fault Lab handlers ─────────────────────────────────────────

  ipcMain.handle(IpcChannel.FAULT_ARM, async (_event, raw: unknown) => {
    const { fault } = raw as { fault: string }
    faultInjector.arm(fault as FaultType)
    return { armed: faultInjector.listArmed() }
  })

  ipcMain.handle(IpcChannel.FAULT_DISARM, async (_event, raw: unknown) => {
    const { fault } = raw as { fault: string }
    faultInjector.disarm(fault as FaultType)
    return { armed: faultInjector.listArmed() }
  })

  ipcMain.handle(IpcChannel.FAULT_LIST, async () => {
    return { armed: faultInjector.listArmed() }
  })
}

// ── App lifecycle ────────────────────────────────────────────────

app.whenReady().then(() => {
  registerIpcHandlers()

  // Initialize scheduler — creates workflows on schedule
  try {
    scheduler = new Scheduler({
      getDb,
      createWorkflowFn: (goal: string, projectId: string | null) => {
        const wf = createWorkflow(goal, projectId)
        emitToRenderer({ type: 'workflow.status', workflowId: wf.id, status: 'queued' })
      }
    })
    scheduler.start()
  } catch (err) {
    console.error('[Scheduler] Failed to initialize:', err)
  }

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
