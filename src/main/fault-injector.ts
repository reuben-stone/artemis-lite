/**
 * Fault injection for development and demo.
 *
 * Faults are one-shot: once triggered, they automatically disarm.
 * The no-op injector is the default for normal execution.
 * Injected faults produce explicit trace metadata distinguishing
 * them from natural failures.
 */

// ── Fault types ────────────────────────────────────────────────────

export type FaultType =
  | 'model.timeout'
  | 'model.invalid_output'
  | 'model.provider_unavailable'
  | 'tool.timeout'
  | 'tool.failure'
  | 'interrupt.after_step'
  | 'interrupt.after_side_effect'
  | 'interrupt.before_verify'

// ── Interface ──────────────────────────────────────────────────────

export interface FaultInjector {
  /** Called before a model call (plan or verify). Throw to simulate failure. */
  beforeModelCall(phase: 'plan' | 'verify'): Promise<void>

  /** Called after a tool's side effect but before idempotency completion. */
  afterToolSideEffect(stepId: string, toolName: string): Promise<void>

  /** Called after a step is marked completed. */
  afterStepCompletion(stepId: string): Promise<void>

  /** Called before verification begins. */
  beforeVerification(): Promise<void>
}

// ── Error types for fault injection ────────────────────────────────

export class InjectedTimeoutError extends Error {
  readonly injected = true
  constructor(target: string) {
    super(`[INJECTED] ${target} timeout`)
  }
}

export class InjectedProviderError extends Error {
  readonly injected = true
  constructor() {
    super('[INJECTED] Provider unavailable')
  }
}

export class InjectedInvalidOutputError extends Error {
  readonly injected = true
  constructor() {
    super('[INJECTED] Model returned invalid structured output')
  }
}

export class InjectedToolFailureError extends Error {
  readonly injected = true
  constructor(toolName: string) {
    super(`[INJECTED] Tool ${toolName} failure`)
  }
}

export class InjectedInterruptError extends Error {
  readonly injected = true
  readonly interrupt = true
  constructor(point: string) {
    super(`[INJECTED] Process interrupted at: ${point}`)
  }
}

// ── No-op injector (default) ───────────────────────────────────────

export const noOpInjector: FaultInjector = {
  async beforeModelCall() {},
  async afterToolSideEffect() {},
  async afterStepCompletion() {},
  async beforeVerification() {}
}

// ── Injectable fault injector ──────────────────────────────────────

export class InjectableFaultInjector implements FaultInjector {
  private armed = new Set<FaultType>()
  private onFaultArmed?: (fault: FaultType) => void
  private onFaultTriggered?: (fault: FaultType) => void

  constructor(callbacks?: {
    onArmed?: (fault: FaultType) => void
    onTriggered?: (fault: FaultType) => void
  }) {
    this.onFaultArmed = callbacks?.onArmed
    this.onFaultTriggered = callbacks?.onTriggered
  }

  arm(fault: FaultType): void {
    this.armed.add(fault)
    this.onFaultArmed?.(fault)
  }

  disarm(fault: FaultType): void {
    this.armed.delete(fault)
  }

  isArmed(fault: FaultType): boolean {
    return this.armed.has(fault)
  }

  listArmed(): FaultType[] {
    return Array.from(this.armed)
  }

  /** Trigger a one-shot fault: check if armed, disarm, then throw. */
  private trigger(fault: FaultType): boolean {
    if (!this.armed.has(fault)) return false
    this.armed.delete(fault)
    this.onFaultTriggered?.(fault)
    return true
  }

  async beforeModelCall(phase: 'plan' | 'verify'): Promise<void> {
    if (this.trigger('model.timeout')) {
      throw new InjectedTimeoutError(`model.${phase}`)
    }
    if (this.trigger('model.invalid_output')) {
      throw new InjectedInvalidOutputError()
    }
    if (this.trigger('model.provider_unavailable')) {
      throw new InjectedProviderError()
    }
  }

  async afterToolSideEffect(stepId: string, _toolName: string): Promise<void> {
    if (this.trigger('tool.timeout')) {
      throw new InjectedTimeoutError(`tool.${stepId}`)
    }
    if (this.trigger('tool.failure')) {
      throw new InjectedToolFailureError(stepId)
    }
    if (this.trigger('interrupt.after_side_effect')) {
      throw new InjectedInterruptError('after_side_effect')
    }
  }

  async afterStepCompletion(_stepId: string): Promise<void> {
    if (this.trigger('interrupt.after_step')) {
      throw new InjectedInterruptError('after_step')
    }
  }

  async beforeVerification(): Promise<void> {
    if (this.trigger('interrupt.before_verify')) {
      throw new InjectedInterruptError('before_verify')
    }
  }
}
