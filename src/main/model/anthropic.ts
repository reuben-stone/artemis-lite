/**
 * Anthropic adapter for ModelProvider.
 * Translates between domain types and Anthropic SDK.
 * SDK types do not leak beyond this file.
 */
import Anthropic from '@anthropic-ai/sdk'
import {
  PlanSchema, VerificationSchema,
  type ModelProvider, type ModelResult, type PlanOutput, type VerificationOutput,
  type PlanRequest, type VerifyRequest, type ToolDescription
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

// ── Adapter ────────────────────────────────────────────────────────

export class AnthropicProvider implements ModelProvider {
  private client: Anthropic
  private model: string

  constructor(apiKey: string, model = 'claude-sonnet-4-5-20241022') {
    this.client = new Anthropic({ apiKey })
    this.model = model
  }

  async generatePlan(request: PlanRequest): Promise<ModelResult<PlanOutput>> {
    const toolList = request.tools.map(t =>
      `- ${t.name} (${t.mode}): ${t.description}`
    ).join('\n')

    const start = Date.now()
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 1024,
      system: `You are a workflow planner. Given a goal and available tools, produce a structured execution plan as JSON.

Available tools:
${toolList}

Respond ONLY with valid JSON matching this schema:
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
- Return ONLY the JSON object, no markdown fences or explanation.`,
      messages: [{ role: 'user', content: request.goal }]
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
    const start = Date.now()
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 512,
      system: `You are a workflow verifier. Given the original goal, the execution plan, and the results of each step, determine whether the goal has been achieved.

Respond ONLY with valid JSON:
{
  "pass": true or false,
  "reason": "brief explanation (max 500 chars)"
}

Return ONLY the JSON object, no markdown fences or explanation.`,
      messages: [{
        role: 'user',
        content: `Goal: ${request.goal}

Plan: ${JSON.stringify(request.plan, null, 2)}

Step results: ${JSON.stringify(request.stepResults, null, 2)}`
      }]
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
