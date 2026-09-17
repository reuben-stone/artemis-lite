import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdirSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { parseDotenv, loadDotenv, getAppConfig, requireAnthropicKey } from '../src/main/env'

// ── parseDotenv ──────────────────────────────────────────────────

describe('parseDotenv', () => {
  it('parses simple KEY=VALUE', () => {
    const result = parseDotenv('FOO=bar\nBAZ=qux')
    expect(result).toEqual({ FOO: 'bar', BAZ: 'qux' })
  })

  it('handles double-quoted values', () => {
    const result = parseDotenv('KEY="hello world"')
    expect(result).toEqual({ KEY: 'hello world' })
  })

  it('handles single-quoted values', () => {
    const result = parseDotenv("KEY='hello world'")
    expect(result).toEqual({ KEY: 'hello world' })
  })

  it('skips comments and blank lines', () => {
    const result = parseDotenv('# comment\n\nKEY=value\n  # another comment')
    expect(result).toEqual({ KEY: 'value' })
  })

  it('skips lines without =', () => {
    const result = parseDotenv('NOEQUALS\nKEY=value')
    expect(result).toEqual({ KEY: 'value' })
  })

  it('handles values containing =', () => {
    const result = parseDotenv('KEY=abc=def')
    expect(result).toEqual({ KEY: 'abc=def' })
  })

  it('trims whitespace around key and value', () => {
    const result = parseDotenv('  KEY  =  value  ')
    expect(result).toEqual({ KEY: 'value' })
  })

  it('returns empty object for empty content', () => {
    expect(parseDotenv('')).toEqual({})
  })
})

// ── loadDotenv ───────────────────────────────────────────────────

describe('loadDotenv', () => {
  let testDir: string
  const savedEnv: Record<string, string | undefined> = {}

  beforeEach(() => {
    testDir = join(tmpdir(), `artemis-env-test-${Date.now()}`)
    mkdirSync(testDir, { recursive: true })
    // Save env vars we'll touch
    savedEnv.TEST_LOAD_A = process.env.TEST_LOAD_A
    savedEnv.TEST_LOAD_B = process.env.TEST_LOAD_B
    delete process.env.TEST_LOAD_A
    delete process.env.TEST_LOAD_B
  })

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true })
    // Restore
    for (const [k, v] of Object.entries(savedEnv)) {
      if (v === undefined) delete process.env[k]
      else process.env[k] = v
    }
  })

  it('loads variables from .env into process.env', () => {
    writeFileSync(join(testDir, '.env'), 'TEST_LOAD_A=alpha\nTEST_LOAD_B=beta')
    const count = loadDotenv(testDir)
    expect(count).toBe(2)
    expect(process.env.TEST_LOAD_A).toBe('alpha')
    expect(process.env.TEST_LOAD_B).toBe('beta')
  })

  it('does not overwrite existing env vars', () => {
    process.env.TEST_LOAD_A = 'existing'
    writeFileSync(join(testDir, '.env'), 'TEST_LOAD_A=from_file\nTEST_LOAD_B=new')
    const count = loadDotenv(testDir)
    expect(count).toBe(1) // Only TEST_LOAD_B was new
    expect(process.env.TEST_LOAD_A).toBe('existing')
    expect(process.env.TEST_LOAD_B).toBe('new')
  })

  it('returns 0 when .env does not exist', () => {
    const count = loadDotenv(join(testDir, 'nonexistent'))
    expect(count).toBe(0)
  })
})

// ── getAppConfig ─────────────────────────────────────────────────

describe('getAppConfig', () => {
  const saved: Record<string, string | undefined> = {}

  beforeEach(() => {
    saved.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY
    saved.ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL
    delete process.env.ANTHROPIC_API_KEY
    delete process.env.ANTHROPIC_MODEL
  })

  afterEach(() => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k]
      else process.env[k] = v
    }
  })

  it('returns undefined key when ANTHROPIC_API_KEY not set', () => {
    const config = getAppConfig()
    expect(config.anthropicApiKey).toBeUndefined()
  })

  it('returns the key when ANTHROPIC_API_KEY is set', () => {
    process.env.ANTHROPIC_API_KEY = 'sk-test-123'
    const config = getAppConfig()
    expect(config.anthropicApiKey).toBe('sk-test-123')
  })

  it('defaults model to claude-sonnet-4-6', () => {
    const config = getAppConfig()
    expect(config.anthropicModel).toBe('claude-sonnet-4-6')
  })

  it('uses ANTHROPIC_MODEL override when set', () => {
    process.env.ANTHROPIC_MODEL = 'claude-haiku-4-5-20251001'
    const config = getAppConfig()
    expect(config.anthropicModel).toBe('claude-haiku-4-5-20251001')
  })
})

// ── requireAnthropicKey ──────────────────────────────────────────

describe('requireAnthropicKey', () => {
  const saved = process.env.ANTHROPIC_API_KEY

  afterEach(() => {
    if (saved === undefined) delete process.env.ANTHROPIC_API_KEY
    else process.env.ANTHROPIC_API_KEY = saved
  })

  it('returns the key when set', () => {
    process.env.ANTHROPIC_API_KEY = 'sk-test-456'
    expect(requireAnthropicKey()).toBe('sk-test-456')
  })

  it('throws a clear error when not set', () => {
    delete process.env.ANTHROPIC_API_KEY
    expect(() => requireAnthropicKey()).toThrow('ANTHROPIC_API_KEY is not set')
  })
})
