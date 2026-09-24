import { describe, expect, it, vi } from 'vitest'

import { createKeepaliveControl } from '../../src/client/control-model.ts'
import { DEFAULT_SESSION_SETTINGS } from '../../src/shared/settings.ts'
import { createFakeForm } from './fake-form.ts'

const SESSION = 'session-a'

function controlOver(options: Parameters<typeof createFakeForm>[0] = {}) {
  const form = createFakeForm(options)
  const control = createKeepaliveControl({ form, sessionId: SESSION })
  return { form, control }
}

describe('keepalive control model', () => {
  it('defaults a session with no stored entry to enabled with four- and thirty-minute windows', () => {
    const { control } = controlOver({ document: { sessions: {} } })

    expect(control.getSnapshot().status).toBe('ready')
    expect(control.getSnapshot().settings).toEqual(DEFAULT_SESSION_SETTINGS)
  })

  it('reads the stored entry for the addressed session', () => {
    const { control } = controlOver({
      document: { sessions: { [SESSION]: { enabled: false, intervalMs: 60_000, idleTimeoutMs: 120_000 } } },
    })

    expect(control.getSnapshot().settings).toEqual({
      enabled: false,
      intervalMs: 60_000,
      idleTimeoutMs: 120_000,
    })
  })

  it('does not adopt another session stored entry', () => {
    const { control } = controlOver({
      document: { sessions: { 'session-b': { enabled: false, intervalMs: 60_000, idleTimeoutMs: 60_000 } } },
    })

    expect(control.getSnapshot().settings).toEqual(DEFAULT_SESSION_SETTINGS)
  })

  it('reports loading while the namespace has not answered', () => {
    const { control } = controlOver({ status: 'loading' })

    expect(control.getSnapshot().status).toBe('loading')
  })

  it('reports unavailable when the namespace is not exposed to this client', () => {
    const { control } = controlOver({ status: 'unavailable' })

    expect(control.getSnapshot().status).toBe('unavailable')
  })

  it('reports readonly when the host document refuses writes', () => {
    const { control } = controlOver({
      document: { sessions: { [SESSION]: { enabled: false } } },
      writable: false,
    })

    expect(control.getSnapshot().status).toBe('readonly')
    expect(control.getSnapshot().settings.enabled).toBe(false)
  })

  it('reports readonly when the connection keeps preferences process-local', () => {
    const { control } = controlOver({ mode: 'memory' })

    expect(control.getSnapshot().status).toBe('readonly')
  })

  it('reports unavailable instead of presenting defaults when the stored document is invalid', () => {
    const { control } = controlOver({ document: { sessions: { [SESSION]: { intervalMs: 5 } } } })

    expect(control.getSnapshot().status).toBe('unavailable')
  })

  it('writes one session field fenced by the current namespace revision', async () => {
    const { form, control } = controlOver({ document: { sessions: {} }, revision: 7 })

    await control.setEnabled(false)

    expect(form.mutations).toHaveLength(1)
    expect(form.mutations[0]?.expectedRevision).toBe(7)
    expect(form.mutations[0]?.ops).toEqual([{ op: 'set', path: ['sessions', SESSION, 'enabled'], value: false }])
    expect(control.getSnapshot().status).toBe('saved')
    expect(control.getSnapshot().settings.enabled).toBe(false)
  })

  it('converts a fractional refresh interval to whole milliseconds', async () => {
    const { form, control } = controlOver({ document: { sessions: {} } })

    await control.setIntervalMinutes(4.5)

    expect(form.mutations[0]?.ops).toEqual([{ op: 'set', path: ['sessions', SESSION, 'intervalMs'], value: 270_000 }])
    expect(control.getSnapshot().settings.intervalMs).toBe(270_000)
  })

  it('writes the idle window without disturbing the refresh interval', async () => {
    const { form, control } = controlOver({ document: { sessions: {} } })

    await control.setIdleTimeoutMinutes(30)

    expect(form.mutations[0]?.ops).toEqual([
      { op: 'set', path: ['sessions', SESSION, 'idleTimeoutMs'], value: 1_800_000 },
    ])
    expect(control.getSnapshot().settings).toEqual({
      enabled: true,
      intervalMs: 240_000,
      idleTimeoutMs: 1_800_000,
    })
  })

  it('refuses an out-of-range interval without writing', async () => {
    const { form, control } = controlOver({ document: { sessions: {} } })

    await control.setIntervalMinutes(0.001)

    expect(form.mutations).toHaveLength(0)
    expect(control.getSnapshot().status).toBe('error')
    expect(control.getSnapshot().settings).toEqual(DEFAULT_SESSION_SETTINGS)
  })

  it('reports a failed write without pretending the value was stored', async () => {
    const { form, control } = controlOver({ document: { sessions: {} } })
    form.failNextWrite(new Error('settings file is read-only'))

    await control.setEnabled(false)

    expect(control.getSnapshot().status).toBe('error')
    expect(control.getSnapshot().detail).toBe('settings file is read-only')
    expect(control.getSnapshot().settings.enabled).toBe(true)
  })

  it('reports a refused write without pretending the value was stored', async () => {
    const { form, control } = controlOver({ document: { sessions: {} } })
    form.refuseNextWrite()

    await control.setEnabled(false)

    expect(control.getSnapshot().status).toBe('error')
    expect(control.getSnapshot().settings.enabled).toBe(true)
  })

  it('reports a refused duration write without pretending the value was stored', async () => {
    const { form, control } = controlOver({ document: { sessions: {} } })
    form.refuseNextWrite()

    await control.setIntervalMinutes(5)

    expect(control.getSnapshot().status).toBe('error')
    expect(control.getSnapshot().settings.intervalMs).toBe(240_000)
  })

  it('reports a conflict when another surface commits before the fenced write', async () => {
    const { form, control } = controlOver({ document: { sessions: {} }, revision: 1 })
    const release = form.holdWrites()

    const pending = control.setEnabled(false)
    form.commitExternally({ sessions: { [SESSION]: { enabled: true } } })
    release()
    await pending

    expect(control.getSnapshot().status).toBe('conflict')
    expect(control.getSnapshot().settings.enabled).toBe(true)
  })

  it('picks up an external document change even before anyone subscribes', () => {
    const { form, control } = controlOver({ document: { sessions: {} } })
    expect(control.getSnapshot().settings.enabled).toBe(true)

    form.commitExternally({ sessions: { [SESSION]: { enabled: false } } })

    expect(control.getSnapshot().settings.enabled).toBe(false)
  })

  it('reports readonly once the host stops accepting writes, even after a save', async () => {
    const { form, control } = controlOver({ document: { sessions: {} } })
    await control.setEnabled(false)
    expect(control.getSnapshot().status).toBe('saved')

    form.setWritable(false)

    expect(control.getSnapshot().status).toBe('readonly')
    expect(control.getSnapshot().settings.enabled).toBe(false)
  })

  it('queues a second write behind the one in flight', async () => {
    const { form, control } = controlOver({ document: { sessions: {} }, revision: 1 })
    const release = form.holdWrites()

    const first = control.setEnabled(false)
    const second = control.setIntervalMinutes(5)
    expect(form.mutations).toHaveLength(1)

    release()
    await Promise.all([first, second])

    expect(form.mutations).toHaveLength(2)
    expect(form.mutations[1]?.expectedRevision).toBe(2)
    expect(control.getSnapshot().settings).toEqual({
      enabled: false,
      intervalMs: 300_000,
      idleTimeoutMs: 1_800_000,
    })
  })

  it('refuses to write while the section is readonly', async () => {
    const { form, control } = controlOver({ document: { sessions: {} }, writable: false })

    await control.setEnabled(false)

    expect(form.mutations).toHaveLength(0)
    expect(control.getSnapshot().status).toBe('readonly')
  })

  it('notifies subscribers when the stored document changes', () => {
    const { form, control } = controlOver({ document: { sessions: {} } })
    const listener = vi.fn()
    control.subscribe(listener)

    form.commitExternally({ sessions: { [SESSION]: { enabled: false } } })

    expect(listener).toHaveBeenCalled()
    expect(control.getSnapshot().settings.enabled).toBe(false)
  })

  it('stops observing the scope after the last subscriber leaves', () => {
    const { form, control } = controlOver({ document: { sessions: {} } })
    const unsubscribe = control.subscribe(vi.fn())
    expect(form.listenerCount).toBe(1)

    unsubscribe()

    expect(form.listenerCount).toBe(0)
  })
})
