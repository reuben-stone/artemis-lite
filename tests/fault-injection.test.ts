import { describe, it, expect, beforeEach } from 'vitest'
import {
  InjectableFaultInjector, noOpInjector,
  InjectedTimeoutError, InjectedProviderError,
  InjectedInvalidOutputError, InjectedToolFailureError,
  InjectedInterruptError
} from '../src/main/fault-injector'

describe('No-op injector', () => {
  it('does nothing on all hooks', async () => {
    await expect(noOpInjector.beforeModelCall('plan')).resolves.toBeUndefined()
    await expect(noOpInjector.afterToolSideEffect('s1', 'tool')).resolves.toBeUndefined()
    await expect(noOpInjector.afterStepCompletion('s1')).resolves.toBeUndefined()
    await expect(noOpInjector.beforeVerification()).resolves.toBeUndefined()
  })
})

describe('Injectable fault injector', () => {
  let fi: InjectableFaultInjector
  let armedLog: string[]
  let triggeredLog: string[]

  beforeEach(() => {
    armedLog = []
    triggeredLog = []
    fi = new InjectableFaultInjector({
      onArmed: (f) => armedLog.push(f),
      onTriggered: (f) => triggeredLog.push(f)
    })
  })

  describe('model timeout injection', () => {
    it('throws InjectedTimeoutError when armed', async () => {
      fi.arm('model.timeout')
      await expect(fi.beforeModelCall('plan')).rejects.toThrow(InjectedTimeoutError)
      expect(triggeredLog).toEqual(['model.timeout'])
    })

    it('error has injected flag', async () => {
      fi.arm('model.timeout')
      try { await fi.beforeModelCall('plan') } catch (e: any) {
        expect(e.injected).toBe(true)
      }
    })
  })

  describe('invalid structured output injection', () => {
    it('throws InjectedInvalidOutputError when armed', async () => {
      fi.arm('model.invalid_output')
      await expect(fi.beforeModelCall('plan')).rejects.toThrow(InjectedInvalidOutputError)
    })
  })

  describe('provider unavailable injection', () => {
    it('throws InjectedProviderError when armed', async () => {
      fi.arm('model.provider_unavailable')
      await expect(fi.beforeModelCall('plan')).rejects.toThrow(InjectedProviderError)
    })
  })

  describe('tool timeout injection', () => {
    it('throws after tool side effect', async () => {
      fi.arm('tool.timeout')
      await expect(fi.afterToolSideEffect('s1', 'create_work_item')).rejects.toThrow(InjectedTimeoutError)
    })
  })

  describe('tool failure injection', () => {
    it('throws InjectedToolFailureError', async () => {
      fi.arm('tool.failure')
      await expect(fi.afterToolSideEffect('s1', 'create_work_item')).rejects.toThrow(InjectedToolFailureError)
    })
  })

  describe('interrupt injection', () => {
    it('interrupt after step', async () => {
      fi.arm('interrupt.after_step')
      await expect(fi.afterStepCompletion('s1')).rejects.toThrow(InjectedInterruptError)
    })

    it('interrupt after side effect', async () => {
      fi.arm('interrupt.after_side_effect')
      await expect(fi.afterToolSideEffect('s1', 'tool')).rejects.toThrow(InjectedInterruptError)
    })

    it('interrupt before verify', async () => {
      fi.arm('interrupt.before_verify')
      await expect(fi.beforeVerification()).rejects.toThrow(InjectedInterruptError)
    })

    it('interrupt errors have interrupt flag', async () => {
      fi.arm('interrupt.after_step')
      try { await fi.afterStepCompletion('s1') } catch (e: any) {
        expect(e.interrupt).toBe(true)
        expect(e.injected).toBe(true)
      }
    })
  })

  describe('one-shot behaviour', () => {
    it('fault clears after triggering', async () => {
      fi.arm('model.timeout')
      expect(fi.isArmed('model.timeout')).toBe(true)

      await fi.beforeModelCall('plan').catch(() => {})

      expect(fi.isArmed('model.timeout')).toBe(false)
      // Second call should NOT throw
      await expect(fi.beforeModelCall('plan')).resolves.toBeUndefined()
    })

    it('multiple faults can be armed independently', () => {
      fi.arm('model.timeout')
      fi.arm('tool.failure')
      expect(fi.listArmed()).toEqual(['model.timeout', 'tool.failure'])
    })
  })

  describe('callbacks', () => {
    it('calls onArmed when fault is armed', () => {
      fi.arm('model.timeout')
      expect(armedLog).toEqual(['model.timeout'])
    })

    it('calls onTriggered when fault fires', async () => {
      fi.arm('tool.failure')
      await fi.afterToolSideEffect('s1', 'tool').catch(() => {})
      expect(triggeredLog).toEqual(['tool.failure'])
    })
  })

  describe('disarm', () => {
    it('disarming prevents trigger', async () => {
      fi.arm('model.timeout')
      fi.disarm('model.timeout')
      await expect(fi.beforeModelCall('plan')).resolves.toBeUndefined()
    })
  })
})

describe('Error classification', () => {
  it('InjectedTimeoutError is transient-like', () => {
    const err = new InjectedTimeoutError('model.plan')
    expect(err.message).toContain('[INJECTED]')
    expect(err.message).toContain('timeout')
    expect(err.injected).toBe(true)
  })

  it('InjectedProviderError is transient-like', () => {
    const err = new InjectedProviderError()
    expect(err.message).toContain('Provider unavailable')
    expect(err.injected).toBe(true)
  })

  it('InjectedInvalidOutputError is NOT transient', () => {
    const err = new InjectedInvalidOutputError()
    expect(err.message).toContain('invalid')
    expect(err.injected).toBe(true)
    // This should NOT be retried — it's a structural failure
  })

  it('InjectedInterruptError has interrupt flag', () => {
    const err = new InjectedInterruptError('after_step')
    expect(err.interrupt).toBe(true)
    expect(err.injected).toBe(true)
  })
})
