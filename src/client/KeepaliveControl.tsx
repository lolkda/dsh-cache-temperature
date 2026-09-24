import * as React from 'react'
import { useId, useState, type CSSProperties, type ReactElement } from 'react'

import type { SnapshotSelectorHook } from '@deepseek-ai/dsh-client-store'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'

import { minutesToMilliseconds } from '../shared/settings.ts'
import type { KeepaliveControlView } from './control-model.ts'
import { KEEPALIVE_LOCALE_NAMESPACE } from './locales.ts'

/** Composed props this entry consumes from the `conversation.input.left` seat. */
export interface KeepaliveControlProps {
  /** Session this entry is addressed to; a change re-addresses the whole control. */
  readonly sessionId: string
  /** Reactive view of the addressed session's keepalive preference. */
  readonly useKeepalive: SnapshotSelectorHook<KeepaliveControlView>
  /** Store the enabled flag for the addressed session. */
  readonly setEnabled: (enabled: boolean) => Promise<void>
  /** Store the refresh interval in user-facing minutes. */
  readonly setIntervalMinutes: (minutes: number) => Promise<void>
  /** Store the idle window in user-facing minutes. */
  readonly setIdleTimeoutMinutes: (minutes: number) => Promise<void>
  /** Translate one key of this entry's declared locale namespace. */
  readonly t: TranslateNS<typeof KEEPALIVE_LOCALE_NAMESPACE>
}

/** The two editable durations, named by their stored field. */
type DurationField = 'intervalMs' | 'idleTimeoutMs'

/** Tone of one status line, resolved to a theme state token. */
type StatusTone = 'info' | 'success' | 'warn' | 'error'

/** One resolved status line. */
interface StatusLine {
  readonly text: string
  readonly tone: StatusTone
}

/**
 * Render a stored duration as the minutes the user edits. The exact quotient is
 * what keeps the round trip lossless: a rounded display would turn an untouched
 * 1000ms field into 1020ms the moment it were written back.
 * @param milliseconds - stored duration.
 * @returns the minutes text shown in the field.
 */
export function formatMinutes(milliseconds: number): string {
  return String(milliseconds / 60_000)
}

/** Resolve the status line for the current view, or null while there is nothing to report. */
function statusLine(
  view: KeepaliveControlView,
  invalid: boolean,
  t: KeepaliveControlProps['t'],
): StatusLine | null {
  if (invalid) return { text: t('invalidDuration'), tone: 'error' }
  switch (view.status) {
    case 'loading':
      return { text: t('statusLoading'), tone: 'info' }
    case 'saving':
      return { text: t('statusSaving'), tone: 'info' }
    case 'saved':
      return { text: t('statusSaved'), tone: 'success' }
    case 'conflict':
      return { text: t('statusConflict'), tone: 'warn' }
    case 'readonly':
      return { text: t('statusReadonly'), tone: 'info' }
    case 'unavailable':
      return { text: t('statusUnavailable'), tone: 'warn' }
    case 'error':
      return { text: view.detail ?? t('statusUnavailable'), tone: 'error' }
    default:
      return null
  }
}

/** Theme token carrying one status tone. */
function toneColor(tone: StatusTone): string {
  switch (tone) {
    case 'error':
      return 'var(--dsw-alias-state-error-primary, #c62828)'
    case 'warn':
      return 'var(--dsw-alias-state-warn-primary, #a15c00)'
    case 'success':
      return 'var(--dsw-alias-state-success-primary, #2e7d32)'
    default:
      return 'var(--dsw-alias-label-tertiary, inherit)'
  }
}

const visuallyHidden: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  margin: -1,
  padding: 0,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
  border: 0,
}

const wrapperStyle: CSSProperties = {
  position: 'relative',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 2,
}

const panelStyle: CSSProperties = {
  position: 'absolute',
  bottom: 'calc(100% + 8px)',
  left: 0,
  zIndex: 20,
  display: 'grid',
  gap: 6,
  minWidth: 232,
  padding: '10px 12px',
  background: 'var(--dsw-alias-bg-layer-2, #ffffff)',
  color: 'var(--dsw-alias-label-primary, inherit)',
  border: '1px solid var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.12))',
  borderRadius: 8,
  boxShadow: '0 8px 24px var(--dsw-alias-bg-mask-1, rgba(0, 0, 0, 0.12))',
  fontSize: 12,
  lineHeight: 1.4,
  textAlign: 'left',
}

const inputStyle: CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '3px 6px',
  background: 'var(--dsw-alias-bg-base, transparent)',
  color: 'inherit',
  border: '1px solid var(--dsw-alias-border-l1, rgba(0, 0, 0, 0.12))',
  borderRadius: 6,
  font: 'inherit',
}

/** Style one compact control button. */
function buttonStyle(options: { readonly active: boolean; readonly disabled: boolean }): CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    height: 24,
    padding: '0 8px',
    border: `1px solid ${options.active
      ? 'var(--dsw-alias-brand-primary, #247bbf)'
      : 'var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.12))'}`,
    borderRadius: 12,
    background: options.active ? 'var(--dsw-alias-brand-primary, #247bbf)' : 'transparent',
    color: options.active
      ? 'var(--dsw-alias-label-primary-inverted, #ffffff)'
      : 'var(--dsw-alias-label-secondary, inherit)',
    font: 'inherit',
    fontSize: 11,
    lineHeight: 1,
    cursor: options.disabled ? 'not-allowed' : 'pointer',
    opacity: options.disabled ? 0.6 : 1,
  }
}

/**
 * Compact per-session keepalive control for the composer tool row: a switch for
 * this session's preference and a panel editing its two durations.
 * @param props - composed slot props: the injected view hook, the three field
 * writers, and the locale seat.
 * @returns the compact control and, while open, its settings panel.
 */
export function KeepaliveControl({
  sessionId,
  useKeepalive,
  setEnabled,
  setIntervalMinutes,
  setIdleTimeoutMinutes,
  t,
}: KeepaliveControlProps): ReactElement {
  const view = useKeepalive(current => current)
  const [open, setOpen] = useState(false)
  const [drafts, setDrafts] = useState<{ intervalMs: string | null; idleTimeoutMs: string | null }>({
    intervalMs: null,
    idleTimeoutMs: null,
  })
  const [invalid, setInvalid] = useState(false)
  const [boundSession, setBoundSession] = useState(sessionId)
  const baseId = useId()
  const intervalId = `${baseId}-interval`
  const idleId = `${baseId}-idle`

  // Re-addressing the entry to another session drops any draft: an uncommitted
  // edit belongs to the session it was typed in, never to the next one.
  if (boundSession !== sessionId) {
    setBoundSession(sessionId)
    setDrafts({ intervalMs: null, idleTimeoutMs: null })
    setInvalid(false)
  }

  const saving = view.status === 'saving'
  const interactive = !saving
    && (view.status === 'ready' || view.status === 'saved' || view.status === 'error' || view.status === 'conflict')
  const line = statusLine(view, invalid, t)

  /**
   * Commit one edited duration draft. Only a dirty draft is committed, so a
   * blur that merely follows a save can never write the displayed value back,
   * and one edit produces exactly one settings write.
   */
  const commitMinutes = (field: DurationField, text: string): void => {
    if (drafts[field] === null) return
    setDrafts(current => ({ ...current, [field]: null }))
    if (!interactive) return
    const minutes = Number(text.trim())
    if (text.trim() === '' || !Number.isFinite(minutes)) {
      setInvalid(true)
      return
    }
    try {
      minutesToMilliseconds(minutes)
    } catch {
      setInvalid(true)
      return
    }
    setInvalid(false)
    void (field === 'intervalMs' ? setIntervalMinutes(minutes) : setIdleTimeoutMinutes(minutes))
  }

  /** Render one labelled minute field over a draft or the stored value. */
  const durationField = (field: DurationField, id: string, label: string): ReactElement => (
    <div style={{ display: 'grid', gap: 2 }}>
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="number"
        step="any"
        style={inputStyle}
        disabled={!interactive}
        value={drafts[field] ?? formatMinutes(view.settings[field])}
        onChange={event => {
          setInvalid(false)
          setDrafts(current => ({ ...current, [field]: event.target.value }))
        }}
        onBlur={event => commitMinutes(field, event.target.value)}
        onKeyDown={event => {
          if (event.key === 'Enter') {
            event.preventDefault()
            event.stopPropagation()
            commitMinutes(field, event.currentTarget.value)
          }
          if (event.key === 'Escape') {
            event.stopPropagation()
            setOpen(false)
          }
        }}
      />
    </div>
  )

  return (
    <div style={wrapperStyle}>
      <button
        type="button"
        role="switch"
        aria-checked={view.settings.enabled}
        aria-label={t('switchLabel')}
        title={t('hint')}
        disabled={!interactive}
        style={buttonStyle({ active: view.settings.enabled, disabled: !interactive })}
        onClick={() => {
          if (!interactive) return
          void setEnabled(!view.settings.enabled)
        }}
      >
        {t('compactLabel')}
      </button>
      <button
        type="button"
        aria-label={t('settingsLabel')}
        aria-expanded={open}
        aria-haspopup="dialog"
        style={buttonStyle({ active: open, disabled: false })}
        onClick={() => setOpen(current => !current)}
      >
        ⚙
      </button>
      {line !== null && !open
        ? <span role="status" aria-live="polite" style={visuallyHidden}>{line.text}</span>
        : <span role="status" aria-live="polite" style={visuallyHidden} />}
      {open
        ? (
            <div
              role="dialog"
              aria-label={t('panelTitle')}
              style={panelStyle}
              onKeyDown={event => {
                if (event.key === 'Escape') setOpen(false)
              }}
            >
              <strong>{t('panelTitle')}</strong>
              <span style={{ color: 'var(--dsw-alias-label-tertiary, inherit)' }}>{t('hint')}</span>
              {durationField('intervalMs', intervalId, t('intervalLabel'))}
              {durationField('idleTimeoutMs', idleId, t('idleTimeoutLabel'))}
              {line !== null
                ? <span style={{ color: toneColor(line.tone) }}>{line.text}</span>
                : null}
            </div>
          )
        : null}
    </div>
  )
}
