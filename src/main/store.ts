/**
 * SQLite persistence layer.
 * All workflow state is persisted before UI notification.
 */
import Database from 'better-sqlite3'
import { join } from 'path'
import { randomUUID } from 'crypto'
import type {
  WorkflowStatus,
  StepStatus,
  StepType
} from '../shared/ipc'

// ── Types ──────────────────────────────────────────────────────────

export interface ProjectRow {
  id: string
  name: string
  path: string              // absolute workspace root (UNIQUE)
  remote: string | null     // git remote URL
  githubOwner: string | null
  githubRepo: string | null
  sentryProject: string | null
  gaPropertyId: string | null
  automationPolicy: string  // 'observe_only' | 'auto_investigate'
  createdAt: string
}

export interface WorkflowRow {
  id: string
  goal: string
  status: WorkflowStatus
  plan: string | null       // JSON
  currentStepId: string | null
  projectId: string | null  // FK to projects
  signalId: string | null   // FK to operational_signals (if triggered by signal)
  createdAt: string
  updatedAt: string
}

export interface StepRow {
  id: string
  workflowId: string
  type: StepType
  status: StepStatus
  attempt: number
  toolName: string | null
  inputData: string | null   // JSON
  outputData: string | null  // JSON
  startedAt: string | null
  completedAt: string | null
}

export interface TraceEventRow {
  id: string
  workflowId: string
  stepId: string | null
  timestamp: string
  type: string
  status: string | null
  durationMs: number | null
  model: string | null
  inputTokens: number | null
  outputTokens: number | null
  toolName: string | null
  retry: number | null
  errorCode: string | null
  metadata: string | null    // JSON
}

export interface ApprovalRow {
  id: string
  workflowId: string
  stepId: string
  action: string
  summary: string
  risk: string
  payloadPreview: string | null  // JSON
  status: string                 // pending | approved | rejected
  resolvedAt: string | null
}

export interface IdempotencyRow {
  key: string
  status: string          // pending | completed
  result: string | null   // JSON
  createdAt: string
}

export interface WorkflowArtifact {
  toolName: string
  objective: string
  data: unknown
}

export interface WorkflowResultRow {
  id: string
  workflowId: string
  status: 'succeeded' | 'failed' | 'partial'
  summary: string
  verificationReason: string | null
  artifacts: string | null  // JSON: WorkflowArtifact[]
  createdAt: string
}

export interface SignalRow {
  id: string
  source: string              // 'sentry' (future: 'ci', 'monitor')
  externalId: string          // Sentry issue ID (stable numeric)
  shortId: string | null      // e.g. "LUMI-42"
  projectId: string           // Artemis project ID
  title: string
  level: string | null        // error/warning/fatal
  eventCount: number
  firstSeen: string | null
  lastSeen: string | null
  status: string              // observed/investigating/investigated/published/resolved/ignored
  workflowId: string | null   // set when workflow claimed
  prNumber: number | null     // set when PR published
  createdAt: string
  updatedAt: string
}

export interface UsageRow {
  id: string
  workflowId: string
  stepId: string | null
  provider: string
  model: string
  inputTokens: number
  outputTokens: number
  estimatedCost: number | null
  timestamp: string
}

// ── Database ───────────────────────────────────────────────────────

let db: Database.Database | null = null

let dbOpener: (() => Database.Database) | null = null
export function __setDbOpener(opener: (() => Database.Database) | null): void {
  dbOpener = opener
  db = null
}

export function getDb(): Database.Database {
  if (db) return db

  if (dbOpener) {
    db = dbOpener()
  } else {
    const { app } = require('electron')
    const dbPath = join(app.getPath('userData'), 'artemis-lite.db')
    db = new Database(dbPath)
    db.pragma('journal_mode = WAL')
    db.pragma('synchronous = NORMAL')
  }

  initDb(db)
  return db
}

function initDb(d: Database.Database): void {
  d.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      path TEXT NOT NULL UNIQUE,
      remote TEXT,
      createdAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS workflows (
      id TEXT PRIMARY KEY,
      goal TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued',
      plan TEXT,
      currentStepId TEXT,
      projectId TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      FOREIGN KEY (projectId) REFERENCES projects(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS workflow_steps (
      id TEXT PRIMARY KEY,
      workflowId TEXT NOT NULL,
      type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      attempt INTEGER NOT NULL DEFAULT 1,
      toolName TEXT,
      inputData TEXT,
      outputData TEXT,
      startedAt TEXT,
      completedAt TEXT,
      FOREIGN KEY (workflowId) REFERENCES workflows(id)
    );

    CREATE TABLE IF NOT EXISTS trace_events (
      id TEXT PRIMARY KEY,
      workflowId TEXT NOT NULL,
      stepId TEXT,
      timestamp TEXT NOT NULL,
      type TEXT NOT NULL,
      status TEXT,
      durationMs REAL,
      model TEXT,
      inputTokens INTEGER,
      outputTokens INTEGER,
      toolName TEXT,
      retry INTEGER,
      errorCode TEXT,
      metadata TEXT,
      FOREIGN KEY (workflowId) REFERENCES workflows(id)
    );

    CREATE TABLE IF NOT EXISTS approvals (
      id TEXT PRIMARY KEY,
      workflowId TEXT NOT NULL,
      stepId TEXT NOT NULL,
      action TEXT NOT NULL,
      summary TEXT NOT NULL,
      risk TEXT NOT NULL DEFAULT 'medium',
      payloadPreview TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      resolvedAt TEXT,
      FOREIGN KEY (workflowId) REFERENCES workflows(id)
    );

    CREATE TABLE IF NOT EXISTS context_packets (
      id TEXT PRIMARY KEY,
      workflowId TEXT NOT NULL,
      stepId TEXT,
      phase TEXT NOT NULL,
      composition TEXT NOT NULL,
      estimatedTokens INTEGER NOT NULL,
      providerInputTokens INTEGER,
      createdAt TEXT NOT NULL,
      FOREIGN KEY (workflowId) REFERENCES workflows(id)
    );

    CREATE INDEX IF NOT EXISTS idx_context_workflow ON context_packets(workflowId);

    CREATE TABLE IF NOT EXISTS idempotency_ledger (
      key TEXT PRIMARY KEY,
      status TEXT NOT NULL DEFAULT 'pending',
      result TEXT,
      createdAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS usage_records (
      id TEXT PRIMARY KEY,
      workflowId TEXT NOT NULL,
      stepId TEXT,
      provider TEXT NOT NULL,
      model TEXT NOT NULL,
      inputTokens INTEGER NOT NULL DEFAULT 0,
      outputTokens INTEGER NOT NULL DEFAULT 0,
      estimatedCost REAL,
      timestamp TEXT NOT NULL,
      FOREIGN KEY (workflowId) REFERENCES workflows(id)
    );

    CREATE INDEX IF NOT EXISTS idx_steps_workflow ON workflow_steps(workflowId);
    CREATE INDEX IF NOT EXISTS idx_trace_workflow ON trace_events(workflowId);
    CREATE INDEX IF NOT EXISTS idx_usage_workflow ON usage_records(workflowId);
    CREATE INDEX IF NOT EXISTS idx_approvals_workflow ON approvals(workflowId);

    CREATE TABLE IF NOT EXISTS operational_signals (
      id TEXT PRIMARY KEY,
      source TEXT NOT NULL,
      externalId TEXT NOT NULL,
      shortId TEXT,
      projectId TEXT NOT NULL,
      title TEXT NOT NULL,
      level TEXT,
      eventCount INTEGER NOT NULL DEFAULT 0,
      firstSeen TEXT,
      lastSeen TEXT,
      status TEXT NOT NULL DEFAULT 'observed',
      workflowId TEXT,
      prNumber INTEGER,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      UNIQUE(source, externalId)
    );

    CREATE INDEX IF NOT EXISTS idx_signals_project ON operational_signals(projectId);
    CREATE INDEX IF NOT EXISTS idx_signals_status ON operational_signals(status);
  `)

  d.exec(`
    CREATE TABLE IF NOT EXISTS workflow_results (
      id TEXT PRIMARY KEY,
      workflowId TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL,
      summary TEXT NOT NULL,
      verificationReason TEXT,
      artifacts TEXT,
      createdAt TEXT NOT NULL,
      FOREIGN KEY (workflowId) REFERENCES workflows(id)
    );

    CREATE INDEX IF NOT EXISTS idx_results_workflow ON workflow_results(workflowId);
  `)

  // ── Migrations ──────────────────────────────────────────────────
  // Add GitHub identity columns to projects (Phase 4)
  const cols = d.prepare("PRAGMA table_info(projects)").all() as { name: string }[]
  const colNames = new Set(cols.map(c => c.name))
  if (!colNames.has('githubOwner')) {
    d.exec('ALTER TABLE projects ADD COLUMN githubOwner TEXT')
  }
  if (!colNames.has('githubRepo')) {
    d.exec('ALTER TABLE projects ADD COLUMN githubRepo TEXT')
  }
  if (!colNames.has('sentryProject')) {
    d.exec('ALTER TABLE projects ADD COLUMN sentryProject TEXT')
  }
  if (!colNames.has('gaPropertyId')) {
    d.exec('ALTER TABLE projects ADD COLUMN gaPropertyId TEXT')
  }
  if (!colNames.has('automationPolicy')) {
    d.exec("ALTER TABLE projects ADD COLUMN automationPolicy TEXT DEFAULT 'observe_only'")
  }

  // Add signalId to workflows (links workflow to the signal that triggered it)
  const wfCols = d.prepare("PRAGMA table_info(workflows)").all() as { name: string }[]
  const wfColNames = new Set(wfCols.map(c => c.name))
  if (!wfColNames.has('signalId')) {
    d.exec('ALTER TABLE workflows ADD COLUMN signalId TEXT')
  }
}

// ── Project CRUD ──────────────────────────────────────────────────

export function createProject(
  name: string,
  path: string,
  remote?: string | null,
  github?: { owner: string; repo: string } | null
): ProjectRow {
  const d = getDb()
  const row: ProjectRow = {
    id: randomUUID(),
    name,
    path,
    remote: remote ?? null,
    githubOwner: github?.owner ?? null,
    githubRepo: github?.repo ?? null,
    sentryProject: null,
    gaPropertyId: null,
    automationPolicy: 'observe_only',
    createdAt: new Date().toISOString()
  }
  d.prepare(`INSERT INTO projects (id, name, path, remote, githubOwner, githubRepo, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(row.id, row.name, row.path, row.remote, row.githubOwner, row.githubRepo, row.createdAt)
  return row
}

export function updateProjectGitHub(id: string, owner: string | null, repo: string | null): void {
  getDb().prepare('UPDATE projects SET githubOwner = ?, githubRepo = ? WHERE id = ?')
    .run(owner, repo, id)
}

export function updateProjectIntegrations(id: string, fields: { sentryProject?: string | null; gaPropertyId?: string | null; automationPolicy?: string }): void {
  const d = getDb()
  if (fields.sentryProject !== undefined) {
    d.prepare('UPDATE projects SET sentryProject = ? WHERE id = ?').run(fields.sentryProject, id)
  }
  if (fields.gaPropertyId !== undefined) {
    d.prepare('UPDATE projects SET gaPropertyId = ? WHERE id = ?').run(fields.gaPropertyId, id)
  }
  if (fields.automationPolicy !== undefined) {
    d.prepare('UPDATE projects SET automationPolicy = ? WHERE id = ?').run(fields.automationPolicy, id)
  }
}

export function getProject(id: string): ProjectRow | undefined {
  return getDb().prepare('SELECT * FROM projects WHERE id = ?').get(id) as ProjectRow | undefined
}

export function getProjectByPath(path: string): ProjectRow | undefined {
  return getDb().prepare('SELECT * FROM projects WHERE path = ?').get(path) as ProjectRow | undefined
}

export function listProjects(): ProjectRow[] {
  return getDb().prepare('SELECT * FROM projects ORDER BY createdAt ASC').all() as ProjectRow[]
}

export function removeProject(id: string): void {
  const d = getDb()
  d.prepare('DELETE FROM projects WHERE id = ?').run(id)
  // If removed project was active, clear active
  const active = getMetaValue('active_project')
  if (active === id) {
    const remaining = listProjects()
    setMetaValue('active_project', remaining.length > 0 ? remaining[0].id : null)
  }
}

// ── Meta (key/value settings) ──────────────────────────────────────

export function getMetaValue(key: string): string | null {
  const row = getDb().prepare('SELECT value FROM meta WHERE key = ?').get(key) as { value: string } | undefined
  return row?.value ?? null
}

export function setMetaValue(key: string, value: string | null): void {
  if (value === null) {
    getDb().prepare('DELETE FROM meta WHERE key = ?').run(key)
  } else {
    getDb().prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)').run(key, value)
  }
}

// ── Active project ─────────────────────────────────────────────────

export function getActiveProjectId(): string | null {
  return getMetaValue('active_project')
}

export function setActiveProjectId(projectId: string): void {
  setMetaValue('active_project', projectId)
}

export function getActiveProject(): ProjectRow | undefined {
  const id = getActiveProjectId()
  if (!id) return undefined
  return getProject(id)
}

// ── Workflow Result CRUD ───────────────────────────────────────────

export function createWorkflowResult(
  workflowId: string,
  status: 'succeeded' | 'failed' | 'partial',
  summary: string,
  verificationReason?: string | null,
  artifacts?: WorkflowArtifact[]
): WorkflowResultRow {
  const d = getDb()
  const row: WorkflowResultRow = {
    id: randomUUID(),
    workflowId,
    status,
    summary,
    verificationReason: verificationReason ?? null,
    artifacts: artifacts ? JSON.stringify(artifacts) : null,
    createdAt: new Date().toISOString()
  }
  d.prepare(`INSERT OR REPLACE INTO workflow_results (id, workflowId, status, summary, verificationReason, artifacts, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(row.id, row.workflowId, row.status, row.summary, row.verificationReason, row.artifacts, row.createdAt)
  return row
}

export function getWorkflowResult(workflowId: string): WorkflowResultRow | undefined {
  return getDb().prepare('SELECT * FROM workflow_results WHERE workflowId = ?').get(workflowId) as WorkflowResultRow | undefined
}

// ── Workflow CRUD ──────────────────────────────────────────────────

export function createWorkflow(goal: string, projectId?: string | null, signalId?: string | null, id?: string): WorkflowRow {
  const d = getDb()
  const now = new Date().toISOString()
  const row: WorkflowRow = {
    id: id ?? randomUUID(),
    goal,
    status: 'queued',
    plan: null,
    currentStepId: null,
    projectId: projectId ?? null,
    signalId: signalId ?? null,
    createdAt: now,
    updatedAt: now
  }
  d.prepare(`
    INSERT INTO workflows (id, goal, status, plan, currentStepId, projectId, signalId, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(row.id, row.goal, row.status, row.plan, row.currentStepId, row.projectId, row.signalId, row.createdAt, row.updatedAt)
  return row
}

export function getWorkflow(id: string): WorkflowRow | undefined {
  return getDb().prepare('SELECT * FROM workflows WHERE id = ?').get(id) as WorkflowRow | undefined
}

export function listWorkflows(): WorkflowRow[] {
  return getDb().prepare('SELECT * FROM workflows ORDER BY createdAt DESC').all() as WorkflowRow[]
}

export function listNonTerminalWorkflows(): WorkflowRow[] {
  return getDb().prepare(
    "SELECT * FROM workflows WHERE status NOT IN ('completed', 'failed', 'cancelled') ORDER BY createdAt DESC"
  ).all() as WorkflowRow[]
}

export function deleteWorkflow(id: string): void {
  const d = getDb()
  // Clear signal reference but don't delete the signal itself
  d.prepare("UPDATE operational_signals SET workflowId = NULL WHERE workflowId = ?").run(id)
  d.prepare('DELETE FROM workflow_results WHERE workflowId = ?').run(id)
  d.prepare('DELETE FROM context_packets WHERE workflowId = ?').run(id)
  d.prepare('DELETE FROM usage_records WHERE workflowId = ?').run(id)
  d.prepare('DELETE FROM trace_events WHERE workflowId = ?').run(id)
  d.prepare('DELETE FROM approvals WHERE workflowId = ?').run(id)
  d.prepare('DELETE FROM idempotency_ledger WHERE key LIKE ?').run(`${id}:%`)
  d.prepare('DELETE FROM workflow_steps WHERE workflowId = ?').run(id)
  d.prepare('DELETE FROM workflows WHERE id = ?').run(id)
}

export function updateWorkflow(id: string, fields: Partial<Pick<WorkflowRow, 'status' | 'plan' | 'currentStepId'>>): void {
  const d = getDb()
  const sets: string[] = ['updatedAt = ?']
  const vals: unknown[] = [new Date().toISOString()]

  if (fields.status !== undefined) { sets.push('status = ?'); vals.push(fields.status) }
  if (fields.plan !== undefined) { sets.push('plan = ?'); vals.push(fields.plan) }
  if (fields.currentStepId !== undefined) { sets.push('currentStepId = ?'); vals.push(fields.currentStepId) }

  vals.push(id)
  d.prepare(`UPDATE workflows SET ${sets.join(', ')} WHERE id = ?`).run(...vals)
}

// ── Step CRUD ──────────────────────────────────────────────────────

export function createStep(workflowId: string, type: StepType, toolName?: string, inputData?: unknown): StepRow {
  const d = getDb()
  const row: StepRow = {
    id: randomUUID(),
    workflowId,
    type,
    status: 'pending',
    attempt: 1,
    toolName: toolName ?? null,
    inputData: inputData ? JSON.stringify(inputData) : null,
    outputData: null,
    startedAt: null,
    completedAt: null
  }
  d.prepare(`
    INSERT INTO workflow_steps (id, workflowId, type, status, attempt, toolName, inputData, outputData, startedAt, completedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(row.id, row.workflowId, row.type, row.status, row.attempt, row.toolName, row.inputData, row.outputData, row.startedAt, row.completedAt)
  return row
}

export function getStep(id: string): StepRow | undefined {
  return getDb().prepare('SELECT * FROM workflow_steps WHERE id = ?').get(id) as StepRow | undefined
}

export function listSteps(workflowId: string): StepRow[] {
  return getDb().prepare('SELECT * FROM workflow_steps WHERE workflowId = ? ORDER BY rowid').all(workflowId) as StepRow[]
}

export function updateStep(id: string, fields: Partial<Pick<StepRow, 'status' | 'attempt' | 'outputData' | 'startedAt' | 'completedAt'>>): void {
  const d = getDb()
  const sets: string[] = []
  const vals: unknown[] = []

  if (fields.status !== undefined) { sets.push('status = ?'); vals.push(fields.status) }
  if (fields.attempt !== undefined) { sets.push('attempt = ?'); vals.push(fields.attempt) }
  if (fields.outputData !== undefined) { sets.push('outputData = ?'); vals.push(fields.outputData) }
  if (fields.startedAt !== undefined) { sets.push('startedAt = ?'); vals.push(fields.startedAt) }
  if (fields.completedAt !== undefined) { sets.push('completedAt = ?'); vals.push(fields.completedAt) }

  if (sets.length === 0) return
  vals.push(id)
  d.prepare(`UPDATE workflow_steps SET ${sets.join(', ')} WHERE id = ?`).run(...vals)
}

export function findStepForApproval(workflowId: string, approvalStepId: string): StepRow | undefined {
  return getDb().prepare('SELECT * FROM workflow_steps WHERE workflowId = ? AND id = ?')
    .get(workflowId, approvalStepId) as StepRow | undefined
}

// ── Trace events ───────────────────────────────────────────────────

export function appendTrace(event: Omit<TraceEventRow, 'id'>): TraceEventRow {
  const d = getDb()
  const row = { ...event, id: randomUUID() }
  d.prepare(`
    INSERT INTO trace_events (id, workflowId, stepId, timestamp, type, status, durationMs, model, inputTokens, outputTokens, toolName, retry, errorCode, metadata)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(row.id, row.workflowId, row.stepId, row.timestamp, row.type, row.status, row.durationMs, row.model, row.inputTokens, row.outputTokens, row.toolName, row.retry, row.errorCode, row.metadata)
  return row
}

export function listTraceEvents(workflowId: string): TraceEventRow[] {
  return getDb().prepare('SELECT * FROM trace_events WHERE workflowId = ? ORDER BY timestamp').all(workflowId) as TraceEventRow[]
}

// ── Approvals ──────────────────────────────────────────────────────

export function createApproval(fields: Omit<ApprovalRow, 'id' | 'status' | 'resolvedAt'>): ApprovalRow {
  const d = getDb()
  const row: ApprovalRow = { ...fields, id: randomUUID(), status: 'pending', resolvedAt: null }
  d.prepare(`
    INSERT INTO approvals (id, workflowId, stepId, action, summary, risk, payloadPreview, status, resolvedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(row.id, row.workflowId, row.stepId, row.action, row.summary, row.risk, row.payloadPreview, row.status, row.resolvedAt)
  return row
}

export function resolveApproval(id: string, decision: 'approved' | 'rejected'): void {
  getDb().prepare('UPDATE approvals SET status = ?, resolvedAt = ? WHERE id = ?')
    .run(decision, new Date().toISOString(), id)
}

export function getApproval(id: string): ApprovalRow | undefined {
  return getDb().prepare('SELECT * FROM approvals WHERE id = ?').get(id) as ApprovalRow | undefined
}

export function listPendingApprovals(workflowId?: string): ApprovalRow[] {
  if (workflowId) {
    return getDb().prepare("SELECT * FROM approvals WHERE workflowId = ? AND status = 'pending'").all(workflowId) as ApprovalRow[]
  }
  return getDb().prepare("SELECT * FROM approvals WHERE status = 'pending'").all() as ApprovalRow[]
}

export function getApprovalForStep(workflowId: string, stepId: string): ApprovalRow | undefined {
  return getDb().prepare("SELECT * FROM approvals WHERE workflowId = ? AND stepId = ?")
    .get(workflowId, stepId) as ApprovalRow | undefined
}

// ── Idempotency ────────────────────────────────────────────────────
// Key format: workflowId:stepId:toolName (no attempt — identifies the logical side effect)

export function idempotencyKey(workflowId: string, stepId: string, toolName: string): string {
  return `${workflowId}:${stepId}:${toolName}`
}

export function checkIdempotency(key: string): IdempotencyRow | undefined {
  return getDb().prepare('SELECT * FROM idempotency_ledger WHERE key = ?').get(key) as IdempotencyRow | undefined
}

export function markIdempotencyPending(key: string): void {
  getDb().prepare('INSERT OR IGNORE INTO idempotency_ledger (key, status, createdAt) VALUES (?, ?, ?)')
    .run(key, 'pending', new Date().toISOString())
}

export function markIdempotencyComplete(key: string, result: unknown): void {
  getDb().prepare('UPDATE idempotency_ledger SET status = ?, result = ? WHERE key = ?')
    .run('completed', JSON.stringify(result), key)
}

// ── Usage ──────────────────────────────────────────────────────────

export function appendUsage(fields: Omit<UsageRow, 'id'>): UsageRow {
  const d = getDb()
  const row = { ...fields, id: randomUUID() }
  d.prepare(`
    INSERT INTO usage_records (id, workflowId, stepId, provider, model, inputTokens, outputTokens, estimatedCost, timestamp)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(row.id, row.workflowId, row.stepId, row.provider, row.model, row.inputTokens, row.outputTokens, row.estimatedCost, row.timestamp)
  return row
}

export function getWorkflowUsage(workflowId: string): { modelCalls: number; inputTokens: number; outputTokens: number; estimatedCost: number; toolCalls: number; retries: number; durationMs: number } {
  const d = getDb()
  const usage = d.prepare(`
    SELECT COUNT(*) as modelCalls,
           COALESCE(SUM(inputTokens), 0) as inputTokens,
           COALESCE(SUM(outputTokens), 0) as outputTokens,
           COALESCE(SUM(estimatedCost), 0) as estimatedCost
    FROM usage_records WHERE workflowId = ?
  `).get(workflowId) as { modelCalls: number; inputTokens: number; outputTokens: number; estimatedCost: number }

  const toolCalls = d.prepare(`
    SELECT COUNT(*) as c FROM trace_events WHERE workflowId = ? AND type = 'tool.completed'
  `).get(workflowId) as { c: number }

  const retries = d.prepare(`
    SELECT COUNT(*) as c FROM trace_events WHERE workflowId = ? AND type = 'tool.retry'
  `).get(workflowId) as { c: number }

  const wf = d.prepare('SELECT createdAt, updatedAt FROM workflows WHERE id = ?').get(workflowId) as { createdAt: string; updatedAt: string } | undefined
  const durationMs = wf
    ? new Date(wf.updatedAt).getTime() - new Date(wf.createdAt).getTime()
    : 0

  return {
    ...usage,
    toolCalls: toolCalls.c,
    retries: retries.c,
    durationMs
  }
}

// ── Context packets ────────────────────────────────────────────────

export interface ContextPacketRow {
  id: string
  workflowId: string
  stepId: string | null
  phase: string
  composition: string   // JSON
  estimatedTokens: number
  providerInputTokens: number | null
  createdAt: string
}

export function appendContextPacket(fields: Omit<ContextPacketRow, 'id'>): ContextPacketRow {
  const d = getDb()
  const row = { ...fields, id: randomUUID() }
  d.prepare(`
    INSERT INTO context_packets (id, workflowId, stepId, phase, composition, estimatedTokens, providerInputTokens, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(row.id, row.workflowId, row.stepId, row.phase, row.composition, row.estimatedTokens, row.providerInputTokens, row.createdAt)
  return row
}

export function updateContextPacketProviderTokens(id: string, providerInputTokens: number): void {
  getDb().prepare('UPDATE context_packets SET providerInputTokens = ? WHERE id = ?')
    .run(providerInputTokens, id)
}

export function listContextPackets(workflowId: string): ContextPacketRow[] {
  return getDb().prepare('SELECT * FROM context_packets WHERE workflowId = ? ORDER BY createdAt')
    .all(workflowId) as ContextPacketRow[]
}

// ── Operational signals ───────────────────────────────────────────
// Core invariant: one external problem = one durable identity.
// UNIQUE(source, externalId) + INSERT ON CONFLICT = atomic dedup.

/**
 * Atomic observation upsert. Deduplicates identity (requirement A).
 *
 * On INSERT: creates new signal with status 'observed'.
 * On CONFLICT: updates only observational fields (eventCount, lastSeen, title, level).
 *              NEVER regresses status, workflowId, or prNumber.
 *
 * Returns { row, isNew } so callers know if this was a first observation.
 */
export function upsertSignal(
  fields: { source: string; externalId: string; shortId?: string | null; projectId: string; title: string; level?: string | null; eventCount: number; firstSeen?: string | null; lastSeen?: string | null }
): { row: SignalRow; isNew: boolean } {
  const d = getDb()
  const now = new Date().toISOString()
  const id = randomUUID()

  const result = d.prepare(`
    INSERT INTO operational_signals (id, source, externalId, shortId, projectId, title, level, eventCount, firstSeen, lastSeen, status, workflowId, prNumber, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'observed', NULL, NULL, ?, ?)
    ON CONFLICT(source, externalId) DO UPDATE SET
      eventCount = excluded.eventCount,
      lastSeen = excluded.lastSeen,
      title = excluded.title,
      level = excluded.level,
      updatedAt = excluded.updatedAt
  `).run(
    id, fields.source, fields.externalId, fields.shortId ?? null, fields.projectId,
    fields.title, fields.level ?? null, fields.eventCount, fields.firstSeen ?? null, fields.lastSeen ?? null,
    now, now
  )

  const row = getSignalByExternalId(fields.source, fields.externalId)!
  // If the row's id matches what we generated, it was inserted (new)
  const isNew = row.id === id
  return { row, isNew }
}

export function getSignalByExternalId(source: string, externalId: string): SignalRow | undefined {
  return getDb().prepare('SELECT * FROM operational_signals WHERE source = ? AND externalId = ?')
    .get(source, externalId) as SignalRow | undefined
}

export function getSignal(id: string): SignalRow | undefined {
  return getDb().prepare('SELECT * FROM operational_signals WHERE id = ?')
    .get(id) as SignalRow | undefined
}

export function listSignals(projectId?: string): SignalRow[] {
  if (projectId) {
    return getDb().prepare('SELECT * FROM operational_signals WHERE projectId = ? ORDER BY updatedAt DESC')
      .all(projectId) as SignalRow[]
  }
  return getDb().prepare('SELECT * FROM operational_signals ORDER BY updatedAt DESC')
    .all() as SignalRow[]
}

export function listSignalsByStatus(status: string): SignalRow[] {
  return getDb().prepare('SELECT * FROM operational_signals WHERE status = ? ORDER BY updatedAt DESC')
    .all(status) as SignalRow[]
}

/**
 * Atomic compare-and-set claim. Returns true if this caller won the claim.
 * Only one concurrent caller can transition observed -> investigating.
 * If false, another execution path already owns this signal.
 *
 * CRITICAL: No specialist execution may begin unless the caller
 * successfully owns the signal claim (return value === true).
 */
export function claimSignal(id: string, workflowId: string): boolean {
  const now = new Date().toISOString()
  const result = getDb().prepare(
    "UPDATE operational_signals SET status = 'investigating', workflowId = ?, updatedAt = ? WHERE id = ? AND status = 'observed' AND workflowId IS NULL"
  ).run(workflowId, now, id)
  return result.changes === 1
}

export function completeSignal(id: string): void {
  const now = new Date().toISOString()
  getDb().prepare(
    "UPDATE operational_signals SET status = 'investigated', updatedAt = ? WHERE id = ? AND status = 'investigating'"
  ).run(now, id)
}

export function failSignal(id: string): void {
  const now = new Date().toISOString()
  getDb().prepare(
    "UPDATE operational_signals SET status = 'failed', updatedAt = ? WHERE id = ? AND status = 'investigating'"
  ).run(now, id)
}

export function publishSignal(id: string, prNumber: number): void {
  const now = new Date().toISOString()
  getDb().prepare(
    "UPDATE operational_signals SET status = 'published', prNumber = ?, updatedAt = ? WHERE id = ?"
  ).run(prNumber, now, id)
}

export function ignoreSignal(id: string): void {
  const now = new Date().toISOString()
  getDb().prepare(
    "UPDATE operational_signals SET status = 'ignored', updatedAt = ? WHERE id = ?"
  ).run(now, id)
}
