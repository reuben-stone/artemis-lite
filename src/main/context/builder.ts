/**
 * Context Builder.
 *
 * Selection policy lives here, not in the orchestrator.
 * The orchestrator requests context for a purpose (plan/verify);
 * the builder decides what evidence to include.
 */
import type {
  ContextItem, ContextPacket, ExcludedItem, ExclusionReason, ContextSource
} from './types'
import { estimateTokens } from './types'
import type { ToolDescription } from '../model/types'
import { gatherRepositoryEvidence, type RepoEvidenceRequest } from './repo-evidence'

// ── Default budget (tokens) ────────────────────────────────────────

const DEFAULT_BUDGET = 8000

const CATEGORY_LIMITS: Record<string, number> = {
  goal: 500,
  step: 300,
  workflow_state: 500,
  tool_definitions: 2500,
  repository_evidence: 3500,
  tool_evidence: 2000,
  investigation_evidence: 4000
}

// ── Builder ────────────────────────────────────────────────────────

export interface BuildContextRequest {
  workflowId: string
  stepId: string | null
  phase: 'plan' | 'verify' | 'investigate'
  goal: string
  currentStep?: { type: string; objective: string }
  workflowState?: { status: string; completedSteps: string[] }
  tools?: ToolDescription[]
  workspacePath: string
  toolEvidence?: Record<string, unknown>
  investigationEvidence?: { iteration: number; toolName: string; result: unknown; objective: string }[]
  budget?: number
}

export async function buildContext(req: BuildContextRequest): Promise<ContextPacket> {
  const budget = req.budget ?? DEFAULT_BUDGET
  const items: ContextItem[] = []
  const excluded: ExcludedItem[] = []
  let used = 0

  // Helper: try to add an item, respecting category and total budget
  function addItem(
    source: ContextSource,
    identifier: string,
    reason: string,
    content: string,
    categoryLimit: number
  ): boolean {
    const tokens = estimateTokens(content)
    let finalContent = content
    let truncated = false

    // Per-category truncation
    if (tokens > categoryLimit) {
      const charLimit = categoryLimit * 4
      finalContent = content.slice(0, charLimit) + '\n[truncated]'
      truncated = true
    }

    const finalTokens = estimateTokens(finalContent)

    // Total budget check
    if (used + finalTokens > budget) {
      excluded.push({ source, identifier, reason: 'budget_exceeded', estimatedTokens: finalTokens })
      return false
    }

    items.push({ source, identifier, reason, content: finalContent, estimatedTokens: finalTokens, truncated })
    used += finalTokens
    return true
  }

  // 1. Goal — always included
  addItem('goal', 'current_goal', 'user goal for this workflow', req.goal, CATEGORY_LIMITS.goal)

  // 2. Current step context
  if (req.currentStep) {
    const stepText = `Step type: ${req.currentStep.type}\nObjective: ${req.currentStep.objective}`
    addItem('step', 'current_step', 'current workflow step', stepText, CATEGORY_LIMITS.step)
  }

  // 3. Workflow state summary
  if (req.workflowState) {
    const stateText = `Status: ${req.workflowState.status}\nCompleted: ${req.workflowState.completedSteps.join(', ') || 'none'}`
    addItem('workflow_state', 'workflow_state', 'current workflow progress', stateText, CATEGORY_LIMITS.workflow_state)
  }

  // 4. Tool definitions (for planning)
  if (req.tools && req.tools.length > 0) {
    const toolText = req.tools.map(t => {
      let text = `- ${t.name} (${t.mode}): ${t.description}`
      if (t.inputSchema && typeof t.inputSchema === 'object') {
        const params = Object.entries(t.inputSchema)
          .map(([name, info]) => {
            const p = info as { type?: string; required?: boolean; description?: string }
            const opt = p.required === false ? '?' : ''
            const desc = p.description ? ` - ${p.description}` : ''
            return `    ${name}${opt}: ${p.type ?? 'unknown'}${desc}`
          }).join('\n')
        if (params) text += '\n' + params
      }
      return text
    }).join('\n')
    addItem('tool_definitions', 'available_tools', 'tools available for this workflow', toolText, CATEGORY_LIMITS.tool_definitions)
  }

  // 5. Repository evidence (for planning — not needed for verification)
  if (req.phase === 'plan') {
    const repoRequest: RepoEvidenceRequest = {
      workspacePath: req.workspacePath,
      goal: req.goal,
      budgetTokens: Math.min(CATEGORY_LIMITS.repository_evidence, budget - used)
    }

    const { evidence, excludedFiles } = await gatherRepositoryEvidence(repoRequest)

    for (const item of evidence) {
      if (!addItem(item.source, item.identifier, item.reason, item.content, CATEGORY_LIMITS.repository_evidence)) {
        // Budget exceeded — remaining evidence is excluded
        break
      }
    }

    for (const ex of excludedFiles) {
      excluded.push(ex)
    }
  }

  // 6. Tool evidence (for verification)
  if (req.toolEvidence && Object.keys(req.toolEvidence).length > 0) {
    const evidenceText = JSON.stringify(req.toolEvidence, null, 2)
    addItem('tool_result', 'step_results', 'results from completed tool executions', evidenceText, CATEGORY_LIMITS.tool_evidence)
  }

  // 7. Investigation evidence (for investigation iterations)
  if (req.investigationEvidence && req.investigationEvidence.length > 0) {
    const evidenceText = req.investigationEvidence.map(e =>
      `[Iteration ${e.iteration}] ${e.toolName}: ${e.objective}\nResult: ${JSON.stringify(e.result, null, 2)}`
    ).join('\n\n')
    addItem('investigation_evidence', 'investigation_history', 'evidence acquired in previous investigation iterations', evidenceText, CATEGORY_LIMITS.investigation_evidence)
  }

  return {
    workflowId: req.workflowId,
    stepId: req.stepId,
    phase: req.phase,
    items,
    excluded,
    budget: { limit: budget, used, remaining: budget - used },
    estimatedTokens: used
  }
}
