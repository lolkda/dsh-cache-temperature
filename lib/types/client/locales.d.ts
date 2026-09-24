import type { LocaleDictOf } from '@deepseek-ai/dsh-client-ui-slots';
/** Locale namespace owning every string the keepalive control renders. */
export declare const KEEPALIVE_LOCALE_NAMESPACE = "cache-keepalive";
/** Dictionary keys of the keepalive control's copy. */
export type KeepaliveLocaleKey = 'compactLabel' | 'switchLabel' | 'settingsLabel' | 'panelTitle' | 'hint' | 'intervalLabel' | 'idleTimeoutLabel' | 'statusLoading' | 'statusSaving' | 'statusSaved' | 'statusConflict' | 'statusReadonly' | 'statusUnavailable' | 'invalidDuration';
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface LocaleNamespaceMap {
        'cache-keepalive': KeepaliveLocaleKey;
    }
}
/** Complete shipped dictionaries for the keepalive namespace. */
export declare const keepaliveDictionaries: {
    readonly en: LocaleDictOf<typeof KEEPALIVE_LOCALE_NAMESPACE>;
    readonly zh: LocaleDictOf<typeof KEEPALIVE_LOCALE_NAMESPACE>;
};
