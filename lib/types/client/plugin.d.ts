import type { LocaleDictOf } from '@deepseek-ai/dsh-client-ui-slots';
import type { ConfigForm } from '@deepseek-ai/dsh-client-ui-settings/client';
import type { ReactElement } from 'react';
import type { KeepaliveControlProps } from './KeepaliveControl.tsx';
import { type KeepaliveControl } from './control-model.ts';
import { KEEPALIVE_LOCALE_NAMESPACE } from './locales.ts';
/** Complete dictionary set this plugin registers for every shipped locale. */
export interface KeepaliveDictionaries {
    readonly en: LocaleDictOf<typeof KEEPALIVE_LOCALE_NAMESPACE>;
    readonly zh: LocaleDictOf<typeof KEEPALIVE_LOCALE_NAMESPACE>;
}
/** Business face injected into this entry: the view source and the three field writers. */
export interface KeepaliveControlInjected {
    /** Observable view of the addressed session's preference. */
    readonly hooks: {
        readonly keepalive: KeepaliveControl;
    };
    /** Store the enabled flag for the addressed session. */
    readonly setEnabled: (enabled: boolean) => Promise<void>;
    /** Store the refresh interval in user-facing minutes. */
    readonly setIntervalMinutes: (minutes: number) => Promise<void>;
    /** Store the idle window in user-facing minutes. */
    readonly setIdleTimeoutMinutes: (minutes: number) => Promise<void>;
}
/** One composer-left entry registration, as this plugin asks the slot registry for it. */
export interface KeepaliveEntryOptions {
    /** Target slot: the composer's compact left tool row. */
    readonly name: 'conversation.input.left';
    /** Entry identity inside that row. */
    readonly id: 'cache-keepalive';
    /** Row position among the compact controls. */
    readonly order: number;
    /** Dictionary namespace supplying this entry's copy. */
    readonly locale: typeof KEEPALIVE_LOCALE_NAMESPACE;
    /** Build the business face for the session the slot resolves. */
    readonly inject: (sessionId: string) => KeepaliveControlInjected;
}
/** Component shape this entry registers into the slot. */
export type KeepaliveComponent = (props: KeepaliveControlProps) => ReactElement;
/**
 * The client capabilities this plugin uses. The DSH entry point adapts the real
 * context to this seam, so the wiring itself is testable without the browser
 * runtime while the real API stays checked at the adapter.
 */
export interface KeepalivePluginHost {
    /** Register a lifecycle-owned resource; the callback returns its disposer. */
    effect(callback: () => () => void, label: string): void;
    /** Register this entry's dictionaries for every shipped locale. */
    registerDictionaries(dictionaries: KeepaliveDictionaries): () => void;
    /**
     * Resolve this plugin's settings entry form by the id the profile composes it
     * under. The form is consumed as an untyped section source because the control
     * validates every raw snapshot at its own boundary; the settings transport
     * accepts no decoder here, so nothing narrows the section before the control.
     * @param entryId - loader entry id owning this plugin's settings section.
     * @returns the entry's observable form.
     */
    formFor(entryId: string): ConfigForm<unknown>;
    /** Contribute one entry into the composer's left tool row. */
    registerControl(options: KeepaliveEntryOptions, component: KeepaliveComponent): () => void;
}
/** Build the injected business face over one session's control. */
export declare function injectedKeepaliveFace(control: KeepaliveControl): KeepaliveControlInjected;
/** Build the composer-left entry over a per-session control resolver. */
export declare function keepaliveEntry(controlFor: (sessionId: string) => KeepaliveControl): KeepaliveEntryOptions;
/**
 * Register the compact keepalive control: its dictionaries, its settings scope,
 * and one composer-left entry that owns a per-session control.
 * @param host - the client capabilities this plugin consumes.
 */
export declare function installKeepaliveControl(host: KeepalivePluginHost): void;
