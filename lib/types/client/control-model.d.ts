import type { ConfigForm } from '@deepseek-ai/dsh-client-ui-settings/client';
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store';
import { type SessionKeepaliveSettings } from '../shared/settings.ts';
/** Honest presentation state of one session's keepalive preference. */
export type KeepaliveControlStatus = 'loading' | 'unavailable' | 'readonly' | 'ready' | 'saving' | 'saved' | 'error' | 'conflict';
/** One session's keepalive preference as the interface presents it. */
export interface KeepaliveControlView {
    /** Where the preference stands right now; never a success the Host did not confirm. */
    readonly status: KeepaliveControlStatus;
    /** Settings in effect for this session; defaults until a stored entry is read. */
    readonly settings: SessionKeepaliveSettings;
    /** Host or validation detail for a failed write; null otherwise. */
    readonly detail: string | null;
}
/** Read and write one session's keepalive preference through the settings form. */
export interface KeepaliveControl extends ObservableSnapshot<KeepaliveControlView> {
    /** Store the enabled flag for this session. */
    setEnabled(enabled: boolean): Promise<void>;
    /** Store the refresh interval, given in user-facing minutes. */
    setIntervalMinutes(minutes: number): Promise<void>;
    /** Store the idle window, given in user-facing minutes. */
    setIdleTimeoutMinutes(minutes: number): Promise<void>;
}
/**
 * Create the per-session control over one bound settings namespace form.
 *
 * Writes carry the namespace revision as their fence, so a concurrent change
 * from another surface is refused instead of overwriting it. The control never
 * reports a stored value the Host did not confirm.
 * @param options - the bound entry form and the session this control addresses.
 * @returns the observable control with its three field writers.
 */
export declare function createKeepaliveControl(options: {
    readonly form: ConfigForm<unknown>;
    readonly sessionId: string;
}): KeepaliveControl;
