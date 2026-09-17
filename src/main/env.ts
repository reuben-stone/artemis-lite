/**
 * Environment loading for the Electron main process.
 *
 * electron-vite's built-in env loading only applies to prefixed variables
 * (MAIN_VITE_, VITE_, etc.) via Vite's static replacement at bundle time.
 * Runtime process.env access (e.g. ANTHROPIC_API_KEY) is not covered.
 *
 * This module reads a .env file from the project root and merges it into
 * process.env at import time. Existing env vars take precedence (shell wins).
 *
 * No dependencies — just fs.readFileSync and basic KEY=VALUE parsing.
 */
import { readFileSync } from 'fs'
import { resolve } from 'path'

/**
 * Parse a .env file into key-value pairs.
 * Supports: KEY=VALUE, KEY="VALUE", KEY='VALUE', comments (#), blank lines.
 * Does not support multi-line values or variable expansion.
 */
export function parseDotenv(content: string): Record<string, string> {
  const result: Record<string, string> = {}
  for (const raw of content.split('\n')) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const eqIndex = line.indexOf('=')
    if (eqIndex === -1) continue
    const key = line.slice(0, eqIndex).trim()
    let value = line.slice(eqIndex + 1).trim()
    // Strip matching quotes
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    if (key) result[key] = value
  }
  return result
}

/**
 * Load .env from a directory into process.env.
 * Existing env vars are NOT overwritten (shell takes precedence).
 * Returns the number of new vars set.
 */
export function loadDotenv(dir: string): number {
  const envPath = resolve(dir, '.env')
  let content: string
  try {
    content = readFileSync(envPath, 'utf-8')
  } catch {
    return 0 // No .env file — not an error
  }
  const parsed = parseDotenv(content)
  let count = 0
  for (const [key, value] of Object.entries(parsed)) {
    if (process.env[key] === undefined) {
      process.env[key] = value
      count++
    }
  }
  return count
}

/**
 * Resolve configuration needed by the main process.
 * All process.env reads for app config happen here — not scattered
 * through individual modules.
 */
export interface AppConfig {
  anthropicApiKey: string | undefined
  anthropicModel: string
}

const DEFAULT_MODEL = 'claude-sonnet-4-6'

export function getAppConfig(): AppConfig {
  return {
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    anthropicModel: process.env.ANTHROPIC_MODEL || DEFAULT_MODEL
  }
}

/**
 * Require the API key or throw a clear error.
 */
export function requireAnthropicKey(): string {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) {
    throw new Error(
      'ANTHROPIC_API_KEY is not set. ' +
      'Add it to .env in the project root or export it in your shell.'
    )
  }
  return key
}
