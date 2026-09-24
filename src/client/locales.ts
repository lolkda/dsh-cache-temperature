import type { LocaleDictOf } from '@deepseek-ai/dsh-client-ui-slots'

/** Locale namespace owning every string the keepalive control renders. */
export const KEEPALIVE_LOCALE_NAMESPACE = 'cache-keepalive'

/** Dictionary keys of the keepalive control's copy. */
export type KeepaliveLocaleKey =
  | 'compactLabel'
  | 'switchLabel'
  | 'settingsLabel'
  | 'panelTitle'
  | 'hint'
  | 'intervalLabel'
  | 'idleTimeoutLabel'
  | 'statusLoading'
  | 'statusSaving'
  | 'statusSaved'
  | 'statusConflict'
  | 'statusReadonly'
  | 'statusUnavailable'
  | 'invalidDuration'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'cache-keepalive': KeepaliveLocaleKey
  }
}

/** Complete shipped dictionaries for the keepalive namespace. */
export const keepaliveDictionaries: {
  readonly en: LocaleDictOf<typeof KEEPALIVE_LOCALE_NAMESPACE>
  readonly zh: LocaleDictOf<typeof KEEPALIVE_LOCALE_NAMESPACE>
} = {
  en: {
    compactLabel: 'Keepalive',
    switchLabel: 'Prompt cache keepalive',
    settingsLabel: 'Keepalive settings',
    panelTitle: 'Keepalive',
    hint: 'Sends a minimal request so this session\'s prompt cache stays warm.',
    intervalLabel: 'Refresh interval (minutes)',
    idleTimeoutLabel: 'Idle window (minutes)',
    statusLoading: 'Loading keepalive settings…',
    statusSaving: 'Saving…',
    statusSaved: 'Saved',
    statusConflict: 'These settings changed elsewhere. Check the values and try again.',
    statusReadonly: 'Read-only: this connection cannot store preferences.',
    statusUnavailable: 'Keepalive settings are unavailable in this connection.',
    invalidDuration: 'That is not a valid duration.',
  },
  zh: {
    compactLabel: '保温',
    switchLabel: '提示缓存保温',
    settingsLabel: '保温设置',
    panelTitle: '保温',
    hint: '发送最小请求，让本会话的提示缓存保持温热。',
    intervalLabel: '刷新间隔（分钟）',
    idleTimeoutLabel: '空闲上限（分钟）',
    statusLoading: '正在读取保温设置…',
    statusSaving: '正在保存…',
    statusSaved: '已保存',
    statusConflict: '设置已在别处改动，请核对数值后重试。',
    statusReadonly: '只读：当前连接无法保存偏好设置。',
    statusUnavailable: '当前连接不支持保温设置。',
    invalidDuration: '这不是有效的时长。',
  },
}
