/**
 * Tool registry with typed contracts.
 * Each tool declares its schema, mode, approval requirement, and execution.
 */
import { z } from 'zod'
import type { ToolDescription } from '../model/types'
import type { GitHubClient } from '../github'
import type { GitHubIdentity } from '../github-types'
import { listWorkspaceFilesTool } from './list_workspace_files'
import { createWorkItemTool } from './create_work_item'
import { getIssuesTool } from './get_issues'
import { getIssueDetailTool } from './get_issue_detail'
import { getPullRequestsTool } from './get_pull_requests'
import { getPRDetailTool } from './get_pr_detail'
import { readFileTool } from './read_file'
import { searchRepositoryTool } from './search_repository'
import { runCommandTool } from './run_command'
import { gitDiffTool } from './git_diff'
import { createBranchTool } from './create_branch'
import { createPullRequestTool } from './create_pull_request'
import { writeFileTool } from './write_file'
import { gitCommitTool } from './git_commit'

// ── Tool contract ──────────────────────────────────────────────────

export interface ToolDefinition<I = unknown, O = unknown> {
  name: string
  description: string
  inputSchema: z.ZodType<I>
  outputSchema: z.ZodType<O>
  mode: 'read' | 'write'
  approval: 'never' | 'write' | 'always'
  timeoutMs: number
  maxRetries: number
  execute: (input: I, ctx: ToolContext) => Promise<O>
}

export interface ToolContext {
  workspacePath: string
  githubClient?: GitHubClient
  githubIdentity?: GitHubIdentity
}

export type ToolRegistry = Map<string, ToolDefinition>

// ── Execute with validation ────────────────────────────────────────

export async function executeTool(
  registry: ToolRegistry,
  name: string,
  rawInput: unknown,
  ctx: ToolContext
): Promise<unknown> {
  const tool = registry.get(name)
  if (!tool) throw new Error(`Unknown tool: ${name}`)

  const input = tool.inputSchema.parse(rawInput)

  const timeout = tool.timeoutMs
  const result = await Promise.race([
    tool.execute(input, ctx),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Tool ${name} timed out after ${timeout}ms`)), timeout)
    )
  ])

  // Validate output
  tool.outputSchema.parse(result)
  return result
}

// ── Tool definitions to model descriptions ─────────────────────────

export function getToolDefinitions(registry: ToolRegistry): ToolDescription[] {
  return Array.from(registry.values()).map(t => ({
    name: t.name,
    description: t.description,
    mode: t.mode,
    inputSchema: zodToJsonHint(t.inputSchema)
  }))
}

// Minimal Zod → JSON schema hint for the model prompt
function zodToJsonHint(schema: z.ZodType): Record<string, unknown> {
  if (schema instanceof z.ZodObject) {
    const shape = schema.shape as Record<string, z.ZodType>
    const props: Record<string, string> = {}
    for (const [k, v] of Object.entries(shape)) {
      props[k] = (v._def as Record<string, unknown>)?.typeName as string ?? 'unknown'
    }
    return props
  }
  return { type: 'unknown' }
}

// ── Create default registry ────────────────────────────────────────

export function createDefaultRegistry(): ToolRegistry {
  const registry: ToolRegistry = new Map()

  registry.set(listWorkspaceFilesTool.name, listWorkspaceFilesTool)
  registry.set(createWorkItemTool.name, createWorkItemTool)
  registry.set(getIssuesTool.name, getIssuesTool)
  registry.set(getIssueDetailTool.name, getIssueDetailTool)
  registry.set(getPullRequestsTool.name, getPullRequestsTool)
  registry.set(getPRDetailTool.name, getPRDetailTool)
  registry.set(readFileTool.name, readFileTool)
  registry.set(searchRepositoryTool.name, searchRepositoryTool)
  registry.set(runCommandTool.name, runCommandTool)
  registry.set(gitDiffTool.name, gitDiffTool)
  registry.set(createBranchTool.name, createBranchTool)
  registry.set(createPullRequestTool.name, createPullRequestTool)
  registry.set(writeFileTool.name, writeFileTool)
  registry.set(gitCommitTool.name, gitCommitTool)

  return registry
}
