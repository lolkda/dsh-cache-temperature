import { describe, expect, it } from 'vitest'
import type { GenerateOptions, MessageId, ReasoningEffortId } from '@deepseek-ai/dsh-llm'
import type { SessionId } from '@deepseek-ai/dsh-session'
import {
  createWarmRequest,
  mayStartWarmRequest,
  nextAttemptDelayMs,
  retryBackoffMs,
  type WarmGateInput,
} from '../../src/host/policy.ts'

const NOW = 1_000_000
const IDLE_DEADLINE = NOW + 60_000

/** Every gate input is permissive; each test disables exactly one condition. */
function gate(overrides: Partial<WarmGateInput> = {}): WarmGateInput {
  return {
    enabled: true,
    hasSnapshot: true,
    foregroundRequests: 0,
    warmInFlight: false,
    running: false,
    toolCount: 0,
    idleDeadline: IDLE_DEADLINE,
    ...overrides,
  }
}

function snapshot(): GenerateOptions {
  return {
    provider: 'stub',
    model: 'stub-model',
    reasoningEffort: 'high' as ReasoningEffortId,
    temperature: 0.25,
    maxTokens: 4_096,
    stop: ['STOP'],
    messages: [{
      id: 'm1' as MessageId,
      role: 'user',
      content: [{ type: 'text', text: 'hello' }],
      source: { kind: 'user' },
    }],
    system: 'system prompt',
    tools: [{ name: 'tool', description: 'described', parameters: {} }],
    sessionId: 's1' as SessionId,
    signal: new AbortController().signal,
  }
}

describe('warm-request admission', () => {
  it('admits a warm request inside the idle window of a completed turn', () => {
    expect(mayStartWarmRequest(gate(), NOW)).toBe(true)
  })

  it('refuses while the feature is disabled for this session', () => {
    expect(mayStartWarmRequest(gate({ enabled: false }), NOW)).toBe(false)
  })

  it('refuses without a successful real request to replay', () => {
    expect(mayStartWarmRequest(gate({ hasSnapshot: false }), NOW)).toBe(false)
  })

  it('refuses while a foreground model request is in flight', () => {
    expect(mayStartWarmRequest(gate({ foregroundRequests: 1 }), NOW)).toBe(false)
    expect(mayStartWarmRequest(gate({ foregroundRequests: 1, running: true, toolCount: 3 }), NOW)).toBe(false)
  })

  it('refuses while this session already has a warm request in flight', () => {
    expect(mayStartWarmRequest(gate({ warmInFlight: true }), NOW)).toBe(false)
  })

  it('refuses once the idle window has expired', () => {
    expect(mayStartWarmRequest(gate({ idleDeadline: NOW }), NOW)).toBe(false)
    expect(mayStartWarmRequest(gate({ idleDeadline: NOW - 1 }), NOW)).toBe(false)
  })

  it('admits a long tool wait even with no idle window and no idle deadline', () => {
    expect(mayStartWarmRequest(
      gate({ running: true, toolCount: 1, idleDeadline: undefined }),
      NOW,
    )).toBe(true)
    expect(mayStartWarmRequest(
      gate({ running: true, toolCount: 2, idleDeadline: NOW - 1 }),
      NOW,
    )).toBe(true)
  })

  it('refuses an open idle window while the agent is running without a tool', () => {
    expect(mayStartWarmRequest(gate({ running: true, toolCount: 0 }), NOW)).toBe(false)
    expect(mayStartWarmRequest(gate({ running: true, toolCount: 0, idleDeadline: NOW + 1 }), NOW)).toBe(false)
  })

  it('refuses an active round that is neither waiting on a tool nor inside an idle window', () => {
    expect(mayStartWarmRequest(gate({ running: true, toolCount: 0, idleDeadline: undefined }), NOW)).toBe(false)
    expect(mayStartWarmRequest(gate({ running: false, toolCount: 0, idleDeadline: undefined }), NOW)).toBe(false)
  })
})

describe('warm-request construction', () => {
  it('replays the snapshot with one output token and a fresh signal', () => {
    const source = snapshot()
    const signal = new AbortController().signal

    const warm = createWarmRequest(source, signal)

    expect(warm.maxTokens).toBe(1)
    expect(warm.signal).toBe(signal)
    expect(warm.signal).not.toBe(source.signal)
    expect(warm).not.toBe(source)
    expect({ ...warm, maxTokens: source.maxTokens, signal: source.signal }).toEqual(source)
  })

  it('leaves the captured snapshot untouched', () => {
    const source = snapshot()

    createWarmRequest(source, new AbortController().signal)

    expect(source.maxTokens).toBe(4_096)
    expect(source.signal).toBeDefined()
  })
})

describe('warm retry pacing', () => {
  it('waits one refresh interval before the next cycle', () => {
    expect(nextAttemptDelayMs(240_000, undefined)).toBe(240_000)
  })

  it('honours a provider retry-after longer than the refresh interval', () => {
    expect(nextAttemptDelayMs(240_000, 600_000)).toBe(600_000)
  })

  it('never shortens the refresh interval for a shorter retry-after', () => {
    expect(nextAttemptDelayMs(240_000, 1_000)).toBe(240_000)
  })

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, -1, 0])(
    'ignores an unusable provider retry-after: %s', retryAfter => {
      expect(nextAttemptDelayMs(240_000, retryAfter)).toBe(240_000)
    },
  )

  it('bounds a provider retry-after to the largest timer delay', () => {
    expect(nextAttemptDelayMs(240_000, 2_147_483_648)).toBe(2_147_483_647)
    expect(nextAttemptDelayMs(240_000, Number.MAX_SAFE_INTEGER)).toBe(2_147_483_647)
  })
})

describe('provider backoff lower bound', () => {
  it('keeps the refresh interval as the floor', () => {
    expect(retryBackoffMs(240_000, undefined)).toBe(240_000)
    expect(retryBackoffMs(240_000, 1_000)).toBe(240_000)
  })

  it('keeps a usable provider retry-after in full, beyond the timer limit', () => {
    expect(retryBackoffMs(240_000, 600_000)).toBe(600_000)
    expect(retryBackoffMs(240_000, 2_592_000_000)).toBe(2_592_000_000)
  })

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, -1, 0])(
    'ignores an unusable provider retry-after: %s', retryAfter => {
      expect(retryBackoffMs(240_000, retryAfter)).toBe(240_000)
    },
  )
})
