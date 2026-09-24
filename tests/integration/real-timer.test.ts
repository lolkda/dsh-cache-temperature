import { AsyncLocalStorage } from 'node:async_hooks'
import { describe, expect, it } from 'vitest'
import { IntegrationHarness, SESSION_A } from './harness.ts'

/**
 * Fake clocks cannot reproduce how a real `setTimeout` callback inherits the
 * Node async context of the code that scheduled it. This regression runs the
 * whole cycle on real timers with a ~1 s interval, so the warm request is
 * initiated from the timer's own async context rather than from inside the
 * foreground request's dispatch — the path a fake clock can silently replace.
 */
describe('warm initiation on a real timer', () => {
  it('starts and completes a warm request from the timer path without a rejection', async () => {
    const harness = await IntegrationHarness.mount()
    const context = new AsyncLocalStorage<string>()
    harness.adapter.storeProbe = () => context.getStore()
    const rejections: unknown[] = []
    const onRejection = (reason: unknown): void => {
      rejections.push(reason)
    }
    process.on('unhandledRejection', onRejection)
    try {
      await harness.writeSessionField(String(SESSION_A), 'intervalMs', 1_000)
      harness.adapter.scriptCalls('complete')
      await context.run('agent-loop', async () => {
        await harness.runTurn(SESSION_A)
      })
      // The real loop appends its own turn events; only what the warm cycle adds
      // is the plugin's side effect, so the count is compared across it.
      const afterTurn = { ...harness.counters }

      await new Promise<void>((resolve) => {
        setTimeout(resolve, 1_400)
      })

      const warm = harness.warmCalls()
      expect(warm).toHaveLength(1)
      const call = warm[0]
      expect(call?.options.maxTokens).toBe(1)
      expect(call?.marked).toBe(false)
      expect(call?.finished).toBe(true)
      expect(call?.aborted).toBe(false)
      // The timer callback inherited the scheduling context, and the warm
      // request still went through the ordinary `llm/stream` path.
      expect(call?.observedStore).toBe('agent-loop')
      expect(call?.duringForegroundConsumption).toBe(false)
      expect(rejections).toEqual([])
      expect(harness.counters).toEqual(afterTurn)
      expect(harness.counters.toolDispatches).toBe(0)
      expect(harness.realCalls()).toHaveLength(1)
    } finally {
      process.off('unhandledRejection', onRejection)
      await harness.dispose()
    }
  }, 20_000)
})
