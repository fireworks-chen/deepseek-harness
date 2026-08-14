/** Shell chrome and General-nav dictionaries; feature rows own their copy. */

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'trigger': '设置',
  'title': '设置',
  'close': '关闭',
  'openDocument': '打开配置文件',
  'openDocument.error': '无法打开配置文件',
  'general.nav': '通用设置',
  'account.menu': '账户菜单',
  'account.personal': '个人中心',
  'account.team': '团队管理',
  'account.settings': '设置',
  'account.coins': '我的金币',
  'account.coins.count': '{count}个',
  'account.logout': '退出登录',
  'account.logout.error': '退出登录失败，请重试',
} satisfies Record<string, string>

/** The settings namespace key union. */
export type SettingsKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'trigger': 'Settings',
  'title': 'Settings',
  'close': 'Close',
  'openDocument': 'Open configuration file',
  'openDocument.error': 'Could not open configuration file',
  'general.nav': 'General',
  'account.menu': 'Account menu',
  'account.personal': 'Personal profile',
  'account.team': 'Team management',
  'account.settings': 'Settings',
  'account.coins': 'My coins',
  'account.coins.count': '{count}',
  'account.logout': 'Sign out',
  'account.logout.error': 'Could not sign out. Try again.',
} satisfies Record<SettingsKey, string>
