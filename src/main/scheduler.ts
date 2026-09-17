/**
 * Durable scheduler for recurring workflows.
 * Creates ordinary workflows on a schedule - no separate execution model.
 * Schedules are persisted in SQLite so they survive restarts.
 */
import { randomUUID } from 'crypto'

// ── Types ──────────────────────────────────────────────────────────

export interface ScheduleRow {
  id: string
  name: string
  goal: string
  cronHour: number        // 0-23
  cronMinute: number      // 0-59
  enabled: boolean
  lastRunAt: string | null
  projectId: string | null
  createdAt: string
}

export interface SchedulerDeps {
  getDb: () => import('better-sqlite3').Database
  createWorkflowFn: (goal: string, projectId?: string | null) => void
}

// ── Scheduler ──────────────────────────────────────────────────────

export class Scheduler {
  private deps: SchedulerDeps
  private intervalId: ReturnType<typeof setInterval> | null = null

  constructor(deps: SchedulerDeps) {
    this.deps = deps
    this.ensureTable()
  }

  private ensureTable(): void {
    this.deps.getDb().exec(`
      CREATE TABLE IF NOT EXISTS schedules (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        goal TEXT NOT NULL,
        cronHour INTEGER NOT NULL,
        cronMinute INTEGER NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        lastRunAt TEXT,
        projectId TEXT,
        createdAt TEXT NOT NULL
      )
    `)
  }

  addSchedule(name: string, goal: string, cronHour: number, cronMinute: number, projectId?: string | null): ScheduleRow {
    const row: ScheduleRow = {
      id: randomUUID(),
      name,
      goal,
      cronHour,
      cronMinute,
      enabled: true,
      lastRunAt: null,
      projectId: projectId ?? null,
      createdAt: new Date().toISOString()
    }
    this.deps.getDb().prepare(
      'INSERT INTO schedules (id, name, goal, cronHour, cronMinute, enabled, lastRunAt, projectId, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(row.id, row.name, row.goal, row.cronHour, row.cronMinute, 1, null, row.projectId, row.createdAt)
    return row
  }

  listSchedules(): ScheduleRow[] {
    return this.deps.getDb().prepare('SELECT * FROM schedules ORDER BY cronHour, cronMinute').all().map(r => ({
      ...(r as any),
      enabled: !!(r as any).enabled
    })) as ScheduleRow[]
  }

  removeSchedule(id: string): void {
    this.deps.getDb().prepare('DELETE FROM schedules WHERE id = ?').run(id)
  }

  toggleSchedule(id: string, enabled: boolean): void {
    this.deps.getDb().prepare('UPDATE schedules SET enabled = ? WHERE id = ?').run(enabled ? 1 : 0, id)
  }

  /**
   * Check if any schedules should fire right now.
   * Called every minute by the interval timer.
   */
  tick(): void {
    const now = new Date()
    const hour = now.getHours()
    const minute = now.getMinutes()
    const today = now.toISOString().slice(0, 10) // YYYY-MM-DD

    const schedules = this.listSchedules().filter(s => s.enabled)

    for (const s of schedules) {
      if (s.cronHour === hour && s.cronMinute === minute) {
        // Check if already ran today
        if (s.lastRunAt && s.lastRunAt.startsWith(today)) continue

        // Fire
        try {
          this.deps.createWorkflowFn(s.goal, s.projectId)
          this.deps.getDb().prepare('UPDATE schedules SET lastRunAt = ? WHERE id = ?')
            .run(now.toISOString(), s.id)
        } catch (err) {
          console.error(`[Scheduler] Failed to create workflow for "${s.name}":`, err)
        }
      }
    }
  }

  start(): void {
    if (this.intervalId) return
    // Check every 60 seconds
    this.intervalId = setInterval(() => this.tick(), 60_000)
    // Also check immediately on start
    this.tick()
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }
  }
}
