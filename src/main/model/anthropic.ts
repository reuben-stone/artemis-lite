/**
 * Anthropic adapter for ModelProvider.
 * Translates between domain types and Anthropic SDK.
 * SDK types do not leak beyond this file.
 */
import Anthropic from '@anthropic-ai/sdk'
import {
  PlanSchema, VerificationSchema, InvestigationActionSchema,
  type ModelProvider, type ModelResult, type PlanOutput, type VerificationOutput,
  type InvestigationAction, type InvestigationActionRequest,
  type PlanRequest, type VerifyRequest
} from './types'

// ── Pricing (USD per million tokens) ───────────────────────────────

const PRICING: Record<string, { input: number; output: number }> = {
  'sonnet': { input: 3, output: 15 },
  'haiku':  { input: 1, output: 5 },
  'opus':   { input: 15, output: 75 }
}

function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  const key = Object.keys(PRICING).find(k => model.includes(k)) ?? 'sonnet'
  const rates = PRICING[key]
  return (inputTokens * rates.input + outputTokens * rates.output) / 1_000_000
}

// ── JSON extraction ───────────────────────────────────────────────
// Models occasionally wrap JSON in markdown fences or add trailing text.
// Extract the first valid JSON object from the response.

function extractJson(text: string): string {
  const trimmed = text.trim()

  // Already starts with { - try it directly
  if (trimmed.startsWith('{')) {
    // Find the matching closing brace
    const end = findClosingBrace(trimmed, 0)
    if (end !== -1) return trimmed.slice(0, end + 1)
    return trimmed
  }

  // Strip markdown fences
  const fenceMatch = trimmed.match(/```(?:json)?\s*\n?([\s\S]*?)```/)
  if (fenceMatch) return extractJson(fenceMatch[1])

  // Find first {
  const start = trimmed.indexOf('{')
  if (start !== -1) {
    const end = findClosingBrace(trimmed, start)
    if (end !== -1) return trimmed.slice(start, end + 1)
  }

  throw new Error(`Model returned non-JSON response: "${trimmed.slice(0, 80)}..."`)
}

function findClosingBrace(text: string, start: number): number {
  let depth = 0
  let inString = false
  let escape = false
  for (let i = start; i < text.length; i++) {
    const ch = text[i]
    if (escape) { escape = false; continue }
    if (ch === '\\' && inString) { escape = true; continue }
    if (ch === '"' && !escape) { inString = !inString; continue }
    if (inString) continue
    if (ch === '{') depth++
    if (ch === '}') { depth--; if (depth === 0) return i }
  }
  return -1
}

// ── Render context packet into prompt sections ─────────────────────

function renderContextForPlan(request: PlanRequest): { system: string; user: string } {
  const sections: string[] = []

  sections.push('You are a workflow planner. Given a goal, available context and tools, produce a structured execution plan as JSON.')

  // Include repository evidence from context packet
  if (request.context) {
    const repoItems = request.context.items.filter(i => i.source === 'file')
    if (repoItems.length > 0) {
      sections.push('REPOSITORY EVIDENCE:')
      for (const item of repoItems) {
        sections.push(item.content)
      }
    }

    // Tool definitions from context
    const toolItems = request.context.items.filter(i => i.source === 'tool_definitions')
    if (toolItems.length > 0) {
      sections.push('AVAILABLE TOOLS:')
      sections.push(toolItems[0].content)
    }
  } else {
    // Fallback: render tools from request
    const toolList = request.tools.map(t =>
      `- ${t.name} (${t.mode}): ${t.description}`
    ).join('\n')
    sections.push(`Available tools:\n${toolList}`)
  }

  sections.push(`Respond ONLY with valid JSON matching this schema:
{
  "summary": "brief description of the plan (max 500 chars)",
  "steps": [
    {
      "id": "step_1",
      "objective": "what this step achieves",
      "preferredAction": "use_tool",
      "toolName": "tool_name_here",
      "toolArgs": { "arg": "value" },
      "reason": "why this step is needed (max 300 chars)"
    }
  ]
}

Rules:
- Maximum 8 steps.
- Only reference tools from the available list.
- For write/side-effecting tools, include them — the system will handle approval.
- Do not include steps that require tools not in the list.
- Return ONLY the JSON object, no markdown fences or explanation.

Execution modes:
- For ANY goal that involves reading, searching, investigating, modifying or creating repository code: use preferredAction "delegate_engineering" with a SINGLE step. This includes bug fixes, error investigation, implementing features, writing files, preparing PRs, or any task that requires understanding repository code. The system will delegate to a specialised coding agent.
- For goals that ONLY use non-repository tools (list GitHub issues, run tests, check status): use the normal multi-step plan.
- When in doubt, use "delegate_engineering". The coding agent handles repository work far more effectively than the bounded tool set.`)

  // Build user message with context
  const userParts: string[] = []
  userParts.push(`GOAL: ${request.goal}`)

  if (request.context) {
    const stateItems = request.context.items.filter(i => i.source === 'workflow_state')
    if (stateItems.length > 0) {
      userParts.push(`WORKFLOW STATE:\n${stateItems[0].content}`)
    }
  }

  return {
    system: sections.join('\n\n'),
    user: userParts.join('\n\n')
  }
}

function renderContextForVerify(request: VerifyRequest): { system: string; user: string } {
  const system = `You are a strict workflow verifier. You must determine whether the ACTUAL EXECUTION EVIDENCE demonstrates that the original goal was achieved.

Rules:
- Evaluate the step results data, not the plan descriptions.
- If multiple steps used the same tool with different arguments, verify each returned DISTINCT results appropriate to its arguments.
- If the evidence is contradictory, incomplete, or does not demonstrate the requested outcome, you MUST fail.
- A tool executing successfully does not mean the goal is met. The returned data must actually satisfy the goal.
- If results appear duplicated or nonsensical relative to the goal, fail with a specific reason.

Respond ONLY with valid JSON:
{
  "pass": true or false,
  "reason": "brief explanation referencing specific evidence (max 500 chars)"
}

Return ONLY the JSON object, no markdown fences or explanation.`

  const userParts: string[] = []
  userParts.push(`Goal: ${request.goal}`)
  userParts.push(`Plan summary: ${request.plan.summary}`)

  // Present step results keyed by plan step ID with objective for clarity
  const evidence: Record<string, { objective: string; toolName?: string; result: unknown }> = {}
  for (const s of request.plan.steps) {
    if (request.stepResults[s.id] !== undefined) {
      evidence[s.id] = {
        objective: s.objective,
        toolName: s.toolName ?? s.preferredAction,
        result: request.stepResults[s.id]
      }
    }
  }
  userParts.push(`Execution evidence:\n${JSON.stringify(evidence, null, 2)}`)

  return { system, user: userParts.join('\n\n') }
}

// ── Investigation prompt ───────────────────────────────────────────

function renderContextForInvestigation(request: InvestigationActionRequest): { system: string; user: string } {
  const toolList = request.allowedTools.map(t => {
    let text = `- ${t.name}: ${t.description}`
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

  const system = `You are investigating a codebase to answer a question or find the cause of an error. You work iteratively: observe evidence, choose the next action, stop when you have sufficient evidence.

Available read-only tools:
${toolList}

Respond ONLY with valid JSON matching ONE of these schemas:

To call a tool:
{ "action": "tool_call", "toolName": "tool_name", "toolArgs": { ... }, "objective": "what this step aims to find (max 300 chars)" }

To stop investigating:
{ "action": "stop", "conclusion": "what you found (max 500 chars)", "outcome": "supported" or "inconclusive", "evidenceRefs": ["file:line or iteration references"] }

Rules:
- Use search_repository with the "directory" parameter to scope searches to relevant subsystems.
- After finding candidates via search, use read_file with offset to examine the actual code.
- Do not repeat a tool call you have already made with the same arguments.
- Stop when you can identify the likely cause with specific file/line evidence, or when further searching is unlikely to help.
- Iteration ${request.iterationNumber + 1} of ${request.maxIterations}. Budget remaining: ~${request.remainingBudgetTokens} tokens.
- You MUST return ONLY a valid JSON object. No prose, no markdown, no explanation before or after the JSON.`

  const userParts: string[] = []
  userParts.push(`GOAL: ${request.goal}`)
  userParts.push(`HYPOTHESIS: ${request.hypothesis}`)

  if (request.evidence.length > 0) {
    // Show recent evidence in full, summarize older evidence to control token growth
    const MAX_FULL_EVIDENCE = 3
    const recentStart = Math.max(0, request.evidence.length - MAX_FULL_EVIDENCE)

    const parts: string[] = []

    // Summarize older evidence
    if (recentStart > 0) {
      const older = request.evidence.slice(0, recentStart)
      const summaries = older.map(e => {
        const resultStr = JSON.stringify(e.result)
        const summary = resultStr.length > 200 ? resultStr.slice(0, 200) + '...[truncated]' : resultStr
        return `[${e.iteration + 1}] ${e.toolName}(${JSON.stringify(e.toolArgs)}) - ${e.objective}: ${summary}`
      }).join('\n')
      parts.push(`EARLIER EVIDENCE (summarized):\n${summaries}`)
    }

    // Full recent evidence
    const recent = request.evidence.slice(recentStart)
    const recentText = recent.map(e =>
      `[Iteration ${e.iteration + 1}] ${e.toolName}(${JSON.stringify(e.toolArgs)})\nObjective: ${e.objective}\nResult: ${JSON.stringify(e.result, null, 2)}`
    ).join('\n\n')
    parts.push(`RECENT EVIDENCE:\n${recentText}`)

    userParts.push(parts.join('\n\n'))
  } else {
    userParts.push('No evidence yet. Start by understanding the project structure.')
  }

  return { system, user: userParts.join('\n\n') }
}

// ── Adapter ────────────────────────────────────────────────────────

export class AnthropicProvider implements ModelProvider {
  private client: Anthropic
  private model: string

  constructor(apiKey: string, model = 'claude-sonnet-4-6') {
    this.client = new Anthropic({ apiKey })
    this.model = model
  }

  async generatePlan(request: PlanRequest): Promise<ModelResult<PlanOutput>> {
    const { system, user } = renderContextForPlan(request)

    const start = Date.now()
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 2048,
      system,
      messages: [{ role: 'user', content: user }]
    })
    const latencyMs = Date.now() - start

    const text = response.content[0].type === 'text' ? response.content[0].text : ''
    const parsed = JSON.parse(extractJson(text))
    const validated = PlanSchema.parse(parsed)

    return {
      data: validated,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        estimatedCost: estimateCost(this.model, response.usage.input_tokens, response.usage.output_tokens)
      },
      latencyMs,
      provider: 'anthropic',
      model: this.model
    }
  }

  async generateVerification(request: VerifyRequest): Promise<ModelResult<VerificationOutput>> {
    const { system, user } = renderContextForVerify(request)

    const start = Date.now()
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 512,
      system,
      messages: [{ role: 'user', content: user }]
    })
    const latencyMs = Date.now() - start

    const text = response.content[0].type === 'text' ? response.content[0].text : ''
    const parsed = JSON.parse(extractJson(text))
    const validated = VerificationSchema.parse(parsed)

    return {
      data: validated,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        estimatedCost: estimateCost(this.model, response.usage.input_tokens, response.usage.output_tokens)
      },
      latencyMs,
      provider: 'anthropic',
      model: this.model
    }
  }

  async generateInvestigationAction(request: InvestigationActionRequest): Promise<ModelResult<InvestigationAction>> {
    const { system, user } = renderContextForInvestigation(request)

    const start = Date.now()
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 512,
      system,
      messages: [{ role: 'user', content: user }]
    })
    const latencyMs = Date.now() - start

    const text = response.content[0].type === 'text' ? response.content[0].text : ''
    const parsed = JSON.parse(extractJson(text))
    const validated = InvestigationActionSchema.parse(parsed)

    return {
      data: validated,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        estimatedCost: estimateCost(this.model, response.usage.input_tokens, response.usage.output_tokens)
      },
      latencyMs,
      provider: 'anthropic',
      model: this.model
    }
  }
}
