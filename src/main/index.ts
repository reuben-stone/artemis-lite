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
  getDb, createWorkflow, listSignals, ignoreSignal, claimSignal, getSignal,
  failSignal, publishSignal
} from './store'
import { ingestSentryIssues, collectAndProcessSignals, isCollecting, setCollecting } from './signals'
import type { SignalRow } from './store'
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
        githubOwner: p.githubOwner ?? null,
        githubRepo: p.githubRepo ?? null,
        automationPolicy: p.automationPolicy ?? 'observe_only',
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
    const input = raw as { projectId: string; sentryProject?: string; gaPropertyId?: string; automationPolicy?: string }
    updateProjectIntegrations(input.projectId, {
      sentryProject: input.sentryProject,
      gaPropertyId: input.gaPropertyId,
      automationPolicy: input.automationPolicy
    })
    return { updated: true }
  })

  // ── Workflow handlers ───────────────────────────────────────────

  ipcMain.handle(IpcChannel.WORKFLOW_START, async (_event, raw: unknown) => {
    const input = StartWorkflowInput.parse(raw)
    const apiKey = requireKey()
    const config = getAppConfig()
    const { projectId, workspacePath } = requireActiveProject()

    // If this workflow is triggered by an operational signal, claim it atomically
    // BEFORE creating the workflow. If the claim fails, another path already owns it.
    if (input.signalId) {
      const { randomUUID } = require('crypto')
      const workflowId = randomUUID()

      // Atomic compare-and-set: claim with the final workflow ID
      const claimed = claimSignal(input.signalId, workflowId)
      if (!claimed) {
        const existing = getSignal(input.signalId)
        return {
          id: null,
          claimed: false,
          existingWorkflowId: existing?.workflowId ?? null,
          signalStatus: existing?.status ?? null
        }
      }

      // Claim succeeded. Create workflow using the same ID that owns the signal.
      // If creation fails, transition signal to failed so it never silently
      // becomes eligible for fresh consequential work.
      let wfRow
      try {
        wfRow = createWorkflow(input.goal, projectId, input.signalId, workflowId)
      } catch (err) {
        failSignal(input.signalId)
        throw err
      }

      const model = new AnthropicProvider(apiKey, config.anthropicModel)
      const tools = createDefaultRegistry()
      const toolCtx = buildToolContext(workspacePath)

      runWorkflow(input.goal, {
        model, tools, workspacePath,
        toolContext: toolCtx,
        emit: emitToRenderer,
        faultInjector
      }, projectId, wfRow.id).catch(err => {
        console.error('[Workflow] Background execution failed:', err)
      })

      return { id: wfRow.id, goal: wfRow.goal, status: wfRow.status, claimed: true }
    }

    // Non-signal workflow: create and run normally
    const wfRow = createWorkflow(input.goal, projectId)

    const model = new AnthropicProvider(apiKey, config.anthropicModel)
    const tools = createDefaultRegistry()
    const toolCtx = buildToolContext(workspacePath)

    runWorkflow(input.goal, {
      model, tools, workspacePath,
      toolContext: toolCtx,
      emit: emitToRenderer,
      faultInjector
    }, projectId, wfRow.id).catch(err => {
      console.error('[Workflow] Background execution failed:', err)
    })

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
      signalSource: wf.signalId ? 'sentry' : null
    })

    // Transition signal: investigated -> published (manual publication)
    if (wf.signalId) {
      publishSignal(wf.signalId, result.prNumber)
    }

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

  // ── Signal handlers ──────────────────────────────────────────────

  ipcMain.handle(IpcChannel.SIGNAL_LIST, async (_event, raw: unknown) => {
    const input = (raw ?? {}) as { projectId?: string }
    const signals = listSignals(input.projectId)
    return { signals }
  })

  ipcMain.handle(IpcChannel.SIGNAL_IGNORE, async (_event, raw: unknown) => {
    const { signalId } = raw as { signalId: string }
    ignoreSignal(signalId)
    return { ignored: true }
  })

  ipcMain.handle(IpcChannel.SIGNAL_INGEST, async (_event, raw: unknown) => {
    const { projectId, projectSlug } = raw as { projectId: string; projectSlug: string }
    const client = createSentryClient()
    if (!client) return { new: [], updated: [], error: 'Sentry not configured' }
    try {
      const issues = await client.listIssues(projectSlug)
      const result = ingestSentryIssues(issues, projectId)
      return result
    } catch (err: any) {
      return { new: [], updated: [], error: err.message }
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
    try {
      const { execFile: execFileCb } = require('child_process')
      const { promisify } = require('util')
      const execFileAsync = promisify(execFileCb)
      const { GITHUB_TOKEN, GH_TOKEN, ...cleanEnv } = process.env
      const env = { ...cleanEnv, PATH: `${process.env.PATH}:/usr/local/bin:/opt/homebrew/bin` }
      const ghPath = '/opt/homebrew/bin/gh'
      const { stdout } = await execFileAsync(ghPath, [
        'pr', 'list', '--repo', `${owner}/${repo}`, '--state', 'open',
        '--json', 'number,title,headRefName,baseRefName,author,isDraft,state,labels',
        '--limit', '30'
      ], { timeout: 15_000, env })
      const raw_prs = JSON.parse(stdout)
      const pullRequests = raw_prs.map((pr: any) => ({
        number: pr.number,
        title: pr.title,
        state: pr.state?.toLowerCase() === 'open' ? 'open' : 'closed',
        body: null,
        author: pr.author?.login ?? 'unknown',
        labels: (pr.labels ?? []).map((l: any) => l.name),
        headBranch: pr.headRefName,
        baseBranch: pr.baseRefName,
        draft: pr.isDraft ?? false,
        mergeable: null,
        createdAt: '',
        updatedAt: '',
        commentCount: 0
      }))
      return { pullRequests }
    } catch (err: any) {
      console.error('[PR Queue] Failed to load PRs:', err.message)
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

// ── Signal collector ─────────────────────────────────────────────

const SIGNAL_COLLECTOR_INTERVAL_MS = 2 * 60_000 // 2 minutes

function buildToolContextForProject(project: { path: string; githubOwner: string | null; githubRepo: string | null; remote: string | null; id: string }): ToolContext {
  const ctx: ToolContext = { workspacePath: project.path }
  const ghToken = getGitHubToken()
  if (ghToken) {
    ctx.githubClient = new GitHubClient(ghToken)
    if (project.githubOwner && project.githubRepo) {
      ctx.githubIdentity = { owner: project.githubOwner, repo: project.githubRepo }
    } else if (project.remote) {
      const identity = parseGitHubRemote(project.remote)
      if (identity) {
        updateProjectGitHub(project.id, identity.owner, identity.repo)
        ctx.githubIdentity = identity
      }
    }
  }
  return ctx
}

async function signalCollectorTick(): Promise<void> {
  // Overlap guard: if a previous tick is still running, skip this one.
  // The guard resets in finally so an exception cannot permanently stop collection.
  if (isCollecting()) {
    console.log('[SignalCollector] Skipping tick - previous collection still in progress')
    return
  }

  setCollecting(true)
  try {
    const projects = listProjects()

    for (const project of projects) {
      // Parse sentry mappings
      let mappings: any[] = []
      try {
        if (project.sentryProject?.startsWith('['))
          mappings = JSON.parse(project.sentryProject)
      } catch { continue }

      // Check execution prerequisites before claiming any signals.
      // If prerequisites are unavailable, downgrade to observe_only
      // so signals are ingested but never claimed.
      let effectivePolicy = project.automationPolicy ?? 'observe_only'
      if (effectivePolicy === 'auto_investigate') {
        if (!hasSecret('anthropic')) {
          effectivePolicy = 'observe_only'
        } else if (!existsSync(project.path)) {
          effectivePolicy = 'observe_only'
        }
      }

      for (const m of mappings) {
        if (!m.sentrySlug) continue
        try {
          const result = await collectAndProcessSignals({
            projectId: project.id,
            sentrySlug: m.sentrySlug,
            automationPolicy: effectivePolicy,
            onClaimed: (signal: SignalRow, workflowId: string, goal: string) => {
              // Signal is already claimed. Any throw here will fail-closed
              // via the try/catch in processIngestedSignals.
              const apiKey = requireKey()
              const config = getAppConfig()

              if (!existsSync(project.path)) {
                throw new Error(`Project path does not exist: ${project.path}`)
              }

              const wf = createWorkflow(goal, project.id, signal.id, workflowId)
              emitToRenderer({ type: 'workflow.status', workflowId: wf.id, status: 'queued' })

              const model = new AnthropicProvider(apiKey, config.anthropicModel)
              const tools = createDefaultRegistry()
              const toolCtx = buildToolContextForProject(project)

              runWorkflow(goal, {
                model, tools, workspacePath: project.path,
                toolContext: toolCtx, emit: emitToRenderer, faultInjector
              }, project.id, wf.id).catch(err => {
                console.error(`[SignalCollector] Workflow ${wf.id} failed:`, err)
              })
            }
          })

          if (result.claimed > 0) {
            console.log(`[SignalCollector] ${project.name}/${m.sentrySlug}: ingested=${result.ingested} claimed=${result.claimed} skipped=${result.skipped}`)
          }
        } catch (err) {
          console.error(`[SignalCollector] ${project.name}/${m.sentrySlug}:`, err)
        }
      }
    }
  } finally {
    setCollecting(false)
  }
}

// ── App lifecycle ────────────────────────────────────────────────

app.whenReady().then(() => {
  registerIpcHandlers()

  // Initialize scheduler — creates workflows on schedule
  try {
    scheduler = new Scheduler({
      getDb,
      createWorkflowFn: (goal: string, projectId?: string | null) => {
        const wf = createWorkflow(goal, projectId)
        emitToRenderer({ type: 'workflow.status', workflowId: wf.id, status: 'queued' })
      }
    })
    scheduler.start()
  } catch (err) {
    console.error('[Scheduler] Failed to initialize:', err)
  }

  // Start signal collector - polls Sentry for all projects every 2 minutes
  signalCollectorTick().catch(err => {
    console.error('[SignalCollector] Initial tick failed:', err)
  })
  setInterval(() => {
    signalCollectorTick().catch(err => {
      console.error('[SignalCollector] Tick failed:', err)
    })
  }, SIGNAL_COLLECTOR_INTERVAL_MS)

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
