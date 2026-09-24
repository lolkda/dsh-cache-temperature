// @vitest-environment jsdom
import { cleanup, createEvent, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { SnapshotSelectorHook } from '@deepseek-ai/dsh-client-store'
import * as React from 'react'
import { useSyncExternalStore } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createKeepaliveControl, type KeepaliveControlView } from '../../src/client/control-model.ts'
import { formatMinutes, KeepaliveControl } from '../../src/client/KeepaliveControl.tsx'
import { keepaliveDictionaries } from '../../src/client/locales.ts'
import { minutesToMilliseconds } from '../../src/shared/settings.ts'
import { createFakeForm, storedSessionEntry, type FakeForm } from './fake-form.ts'

afterEach(cleanup)

const SESSION = 'session-a'
const english: Record<string, string> = { ...keepaliveDictionaries.en }
const t = (key: string): string => english[key] ?? key

/** Build the component element for one session, so a test can re-address the entry. */
function elementForSession(scope: FakeForm, sessionId: string): React.ReactElement {
  const control = createKeepaliveControl({ form: scope, sessionId })
  const useKeepalive: SnapshotSelectorHook<KeepaliveControlView> = selector =>
    selector(useSyncExternalStore(control.subscribe, control.getSnapshot))
  return (
    <KeepaliveControl
      sessionId={sessionId}
      useKeepalive={useKeepalive}
      setEnabled={enabled => control.setEnabled(enabled)}
      setIntervalMinutes={minutes => control.setIntervalMinutes(minutes)}
      setIdleTimeoutMinutes={minutes => control.setIdleTimeoutMinutes(minutes)}
      t={t}
    />
  )
}

/** Render the slot component over a real control bound to a fake scope. */
function renderControl(scope: FakeForm) {
  const control = createKeepaliveControl({ form: scope, sessionId: SESSION })
  const useKeepalive: SnapshotSelectorHook<KeepaliveControlView> = selector =>
    selector(useSyncExternalStore(control.subscribe, control.getSnapshot))
  const view = render(
    <KeepaliveControl
      sessionId={SESSION}
      useKeepalive={useKeepalive}
      setEnabled={enabled => control.setEnabled(enabled)}
      setIntervalMinutes={minutes => control.setIntervalMinutes(minutes)}
      setIdleTimeoutMinutes={minutes => control.setIdleTimeoutMinutes(minutes)}
      t={t}
    />,
  )
  return { ...view, control }
}

/** Stored settings for the addressed session, read straight from the document. */
function storedSession(scope: FakeForm): unknown {
  return storedSessionEntry(scope, SESSION)
}

/** Whether a rendered control refuses interaction. */
function isDisabled(element: HTMLElement): boolean {
  return element.hasAttribute('disabled')
}

/** The switch's announced state. */
function checkedState(element: HTMLElement): string | null {
  return element.getAttribute('aria-checked')
}

/** Open the settings panel from the compact control. */
function openPanel(): void {
  fireEvent.click(screen.getByRole('button', { name: 'Keepalive settings' }))
}

/** Commit a value into one of the two minute fields. */
function commitMinutes(label: string, value: string): void {
  const input = screen.getByLabelText(label)
  fireEvent.change(input, { target: { value } })
  fireEvent.blur(input)
}

describe('keepalive compact control', () => {
  it('renders a switch that is on while the session is enabled', () => {
    const { control } = renderControl(createFakeForm({ document: { sessions: {} } }))

    expect(checkedState(screen.getByRole('switch', { name: 'Prompt cache keepalive' }))).toBe('true')
    expect(control.getSnapshot().settings.enabled).toBe(true)
  })

  it('turns keepalive off for this session when the switch is used', async () => {
    const scope = createFakeForm({ document: { sessions: {} } })
    renderControl(scope)

    fireEvent.click(screen.getByRole('switch', { name: 'Prompt cache keepalive' }))

    await waitFor(() => {
      expect(storedSession(scope)).toEqual({ enabled: false })
    })
    expect(checkedState(screen.getByRole('switch', { name: 'Prompt cache keepalive' }))).toBe('false')
  })

  it('keeps the settings panel closed until its control is used', () => {
    renderControl(createFakeForm({ document: { sessions: {} } }))

    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('shows the stored refresh interval and idle window in minutes', () => {
    renderControl(createFakeForm({ document: { sessions: {} } }))

    openPanel()

    expect(screen.getByLabelText('Refresh interval (minutes)')).toHaveProperty('value', '4')
    expect(screen.getByLabelText('Idle window (minutes)')).toHaveProperty('value', '30')
  })

  it('stores a fractional refresh interval as whole milliseconds', async () => {
    const scope = createFakeForm({ document: { sessions: {} } })
    renderControl(scope)
    openPanel()

    commitMinutes('Refresh interval (minutes)', '4.5')

    await waitFor(() => {
      expect(storedSession(scope)).toEqual({ intervalMs: 270_000 })
    })
  })

  it('reports an out-of-range interval without writing it', async () => {
    const scope = createFakeForm({ document: { sessions: {} } })
    renderControl(scope)
    openPanel()

    commitMinutes('Refresh interval (minutes)', '0.001')

    await waitFor(() => {
      expect(screen.getByText(/not a valid duration/)).toBeTruthy()
    })
    expect(storedSession(scope)).toBeUndefined()
  })

  it('shows that a write is in flight', async () => {
    const scope = createFakeForm({ document: { sessions: {} } })
    renderControl(scope)
    const release = scope.holdWrites()

    fireEvent.click(screen.getByRole('switch', { name: 'Prompt cache keepalive' }))

    await waitFor(() => {
      expect(screen.getByText('Saving…')).toBeTruthy()
    })
    release()
    await waitFor(() => {
      expect(screen.getByText('Saved')).toBeTruthy()
    })
  })

  it('disables the switch while a write is in flight', async () => {
    const scope = createFakeForm({ document: { sessions: {} } })
    renderControl(scope)
    const release = scope.holdWrites()

    fireEvent.click(screen.getByRole('switch', { name: 'Prompt cache keepalive' }))

    await waitFor(() => {
      expect(isDisabled(screen.getByRole('switch', { name: 'Prompt cache keepalive' }))).toBe(true)
    })
    release()
    await waitFor(() => {
      expect(isDisabled(screen.getByRole('switch', { name: 'Prompt cache keepalive' }))).toBe(false)
    })
  })

  it('reports a conflict when another surface commits first', async () => {
    const scope = createFakeForm({ document: { sessions: {} }, revision: 1 })
    renderControl(scope)
    const release = scope.holdWrites()

    fireEvent.click(screen.getByRole('switch', { name: 'Prompt cache keepalive' }))
    scope.commitExternally({ sessions: { [SESSION]: { enabled: true } } })
    release()

    await waitFor(() => {
      expect(screen.getByText(/changed elsewhere/)).toBeTruthy()
    })
  })

  it('disables the controls and explains when the host document refuses writes', () => {
    renderControl(createFakeForm({ document: { sessions: {} }, writable: false }))

    openPanel()

    expect(isDisabled(screen.getByRole('switch', { name: 'Prompt cache keepalive' }))).toBe(true)
    expect(screen.getByText('Read-only: this connection cannot store preferences.')).toBeTruthy()
  })

  it('explains when the namespace is not exposed to this client', () => {
    renderControl(createFakeForm({ status: 'unavailable' }))

    openPanel()

    expect(screen.getByText('Keepalive settings are unavailable in this connection.')).toBeTruthy()
  })

  it('closes the settings panel on Escape', () => {
    renderControl(createFakeForm({ document: { sessions: {} } }))
    openPanel()

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })

    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('shows the idle window it stores without touching the refresh interval', async () => {
    const scope = createFakeForm({ document: { sessions: {} } })
    renderControl(scope)
    openPanel()

    commitMinutes('Idle window (minutes)', '15')

    await waitFor(() => {
      expect(storedSession(scope)).toEqual({ idleTimeoutMs: 900_000 })
    })
  })

  it('announces the status to assistive technology while the panel is closed', async () => {
    const scope = createFakeForm({ document: { sessions: {} } })
    const { control } = renderControl(scope)
    const view: KeepaliveControlView = control.getSnapshot()

    fireEvent.click(screen.getByRole('switch', { name: 'Prompt cache keepalive' }))

    await waitFor(() => {
      expect(screen.getByRole('status').textContent).toBe('Saved')
    })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(view.settings.intervalMs).toBe(240_000)
  })

  it('round-trips every stored duration through the minutes it displays', () => {
    for (const milliseconds of [1_000, 1_020, 60_000, 90_000, 240_000, 270_000, 2_147_483_647]) {
      expect(minutesToMilliseconds(Number(formatMinutes(milliseconds)))).toBe(milliseconds)
    }
  })

  it('does not write a duration the user never edited', async () => {
    const scope = createFakeForm({ document: { sessions: { [SESSION]: { intervalMs: 1_000 } } } })
    renderControl(scope)
    openPanel()

    fireEvent.blur(screen.getByLabelText('Refresh interval (minutes)'))
    fireEvent.blur(screen.getByLabelText('Idle window (minutes)'))

    await waitFor(() => {
      expect(scope.mutations).toHaveLength(0)
    })
    expect(storedSession(scope)).toEqual({ intervalMs: 1_000 })
  })

  it('drops an edited draft when the entry is re-addressed to another session', async () => {
    const scope = createFakeForm({
      document: { sessions: { 'session-a': { intervalMs: 60_000 }, 'session-b': { intervalMs: 120_000 } } },
    })
    const view = render(elementForSession(scope, 'session-a'))
    openPanel()
    fireEvent.change(screen.getByLabelText('Refresh interval (minutes)'), { target: { value: '9' } })

    view.rerender(elementForSession(scope, 'session-b'))

    expect(screen.getByLabelText('Refresh interval (minutes)')).toHaveProperty('value', '2')
    fireEvent.blur(screen.getByLabelText('Refresh interval (minutes)'))
    await waitFor(() => {
      expect(scope.mutations).toHaveLength(0)
    })
    expect(storedSessionEntry(scope, 'session-b')).toEqual({ intervalMs: 120_000 })
  })

  it('writes once when Enter commits a duration', async () => {    const scope = createFakeForm({ document: { sessions: {} } })
    renderControl(scope)
    openPanel()
    const outer = vi.fn()
    document.addEventListener('keydown', outer)
    const input = screen.getByLabelText('Refresh interval (minutes)')
    fireEvent.change(input, { target: { value: '5' } })

    const enter = createEvent.keyDown(input, { key: 'Enter', bubbles: true, cancelable: true })
    fireEvent(input, enter)

    await waitFor(() => {
      expect(storedSession(scope)).toEqual({ intervalMs: 300_000 })
    })
    fireEvent.blur(input)
    expect(scope.mutations).toHaveLength(1)
    expect(enter.defaultPrevented).toBe(true)
    expect(outer).not.toHaveBeenCalled()
    document.removeEventListener('keydown', outer)
  })
})
