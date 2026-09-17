/**
 * Encrypted secret storage for API keys.
 *
 * Keys are encrypted at rest with Electron safeStorage (Keychain on macOS,
 * DPAPI on Windows, libsecret on Linux) and written to userData.
 * Keys are only ever decrypted in the main process - never exposed
 * to the renderer, preload, or IPC.
 *
 * Environment variables take precedence over stored keys (for CI/testing).
 */
import { app, safeStorage } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync, rmSync, existsSync } from 'fs'

type SecretName = 'anthropic' | 'github'

const SECRET_FILES: Record<SecretName, string> = {
  anthropic: 'anthropic.key.enc',
  github: 'github.key.enc'
}

const ENV_VARS: Record<SecretName, string> = {
  anthropic: 'ANTHROPIC_API_KEY',
  github: 'GITHUB_TOKEN'
}

function secretPath(name: SecretName): string {
  return join(app.getPath('userData'), SECRET_FILES[name])
}

export function hasSecret(name: SecretName): boolean {
  if (process.env[ENV_VARS[name]]) return true
  return existsSync(secretPath(name))
}

export function setSecret(name: SecretName, plain: string): void {
  const trimmed = plain.trim()
  if (!trimmed) throw new Error('Empty key')
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('OS encryption unavailable')
  }
  const enc = safeStorage.encryptString(trimmed)
  writeFileSync(secretPath(name), enc)
}

export function getSecret(name: SecretName): string | null {
  // Env var takes precedence (useful for CI and local dev)
  const envVal = process.env[ENV_VARS[name]]
  if (envVal) return envVal

  try {
    const enc = readFileSync(secretPath(name))
    return safeStorage.decryptString(enc)
  } catch {
    return null
  }
}

export function clearSecret(name: SecretName): void {
  try { rmSync(secretPath(name), { force: true }) } catch { /* ok */ }
}

/**
 * Convenience: get the Anthropic API key or throw.
 */
export function requireAnthropicKey(): string {
  const key = getSecret('anthropic')
  if (!key) {
    throw new Error(
      'Anthropic API key not configured. ' +
      'Set it in Settings or export ANTHROPIC_API_KEY in your environment.'
    )
  }
  return key
}

/**
 * Convenience: get the GitHub token (nullable - GitHub is optional).
 */
export function getGitHubToken(): string | null {
  return getSecret('github')
}
