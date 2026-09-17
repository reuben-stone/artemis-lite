/**
 * Anthropic adapter for ModelProvider.
 * Translates between domain types and Anthropic SDK.
 * SDK types do not leak beyond this file.
 */
import Anthropic from '@anthropic-ai/sdk'
import {
  PlanSchema, VerificationSchema,
  type ModelProvider, type ModelResult, type PlanOutput, type VerificationOutput,
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
- Return ONLY the JSON object, no markdown fences or explanation.`)

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
    if (s.toolName && request.stepResults[s.id] !== undefined) {
      evidence[s.id] = {
        objective: s.objective,
        toolName: s.toolName,
        result: request.stepResults[s.id]
      }
    }
  }
  userParts.push(`Execution evidence:\n${JSON.stringify(evidence, null, 2)}`)

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
      max_tokens: 1024,
      system,
      messages: [{ role: 'user', content: user }]
    })
    const latencyMs = Date.now() - start

    const text = response.content[0].type === 'text' ? response.content[0].text : ''
    const parsed = JSON.parse(text)
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
    const parsed = JSON.parse(text)
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
}
