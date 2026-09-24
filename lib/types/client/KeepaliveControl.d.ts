import { type ReactElement } from 'react';
import type { SnapshotSelectorHook } from '@deepseek-ai/dsh-client-store';
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots';
import type { KeepaliveControlView } from './control-model.ts';
import { KEEPALIVE_LOCALE_NAMESPACE } from './locales.ts';
/** Composed props this entry consumes from the `conversation.input.left` seat. */
export interface KeepaliveControlProps {
    /** Session this entry is addressed to; a change re-addresses the whole control. */
    readonly sessionId: string;
    /** Reactive view of the addressed session's keepalive preference. */
    readonly useKeepalive: SnapshotSelectorHook<KeepaliveControlView>;
    /** Store the enabled flag for the addressed session. */
    readonly setEnabled: (enabled: boolean) => Promise<void>;
    /** Store the refresh interval in user-facing minutes. */
    readonly setIntervalMinutes: (minutes: number) => Promise<void>;
    /** Store the idle window in user-facing minutes. */
    readonly setIdleTimeoutMinutes: (minutes: number) => Promise<void>;
    /** Translate one key of this entry's declared locale namespace. */
    readonly t: TranslateNS<typeof KEEPALIVE_LOCALE_NAMESPACE>;
}
/**
 * Render a stored duration as the minutes the user edits. The exact quotient is
 * what keeps the round trip lossless: a rounded display would turn an untouched
 * 1000ms field into 1020ms the moment it were written back.
 * @param milliseconds - stored duration.
 * @returns the minutes text shown in the field.
 */
export declare function formatMinutes(milliseconds: number): string;
/**
 * Compact per-session keepalive control for the composer tool row: a switch for
 * this session's preference and a panel editing its two durations.
 * @param props - composed slot props: the injected view hook, the three field
 * writers, and the locale seat.
 * @returns the compact control and, while open, its settings panel.
 */
export declare function KeepaliveControl({ sessionId, useKeepalive, setEnabled, setIntervalMinutes, setIdleTimeoutMinutes, t, }: KeepaliveControlProps): ReactElement;
