/** Electron account menu rendered in the sidebar footer. */
import { useEffect, useRef, useState } from 'react'
import clsx from 'clsx'
import {
  IconAgentPresetOutline16, IconChevronDownOutline14, IconDataOutline16,
  IconRefreshOutline16, IconSettingsOutline16, IconUserOutline16,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { DesktopAccountSnapshot } from './shell-contract.ts'
import type { SettingsKey } from './locales.ts'
import css from './AccountMenu.module.css'

export interface AccountMenuProps {
  wide: boolean
  account: DesktopAccountSnapshot
  t: (key: SettingsKey) => string
  openSettings: () => void
  logout: () => Promise<void>
}

/**
 * Render account identity, product navigation, settings, balance, and logout.
 * @param props - current Electron account and menu actions.
 * @returns the sidebar trigger and its optional popup.
 */
export function AccountMenu({ wide, account, t, openSettings, logout }: AccountMenuProps) {
  const [open, setOpen] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const [logoutFailed, setLogoutFailed] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const avatar = account.user.avatarUrl?.trim() || account.defaultAvatarDataUrl

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const signOut = async (): Promise<void> => {
    if (signingOut) return
    setSigningOut(true)
    setLogoutFailed(false)
    try {
      await logout()
    } catch {
      setLogoutFailed(true)
    } finally {
      setSigningOut(false)
    }
  }

  const avatarImage = (className: string | undefined) => (
    <img
      className={className}
      src={avatar}
      alt=""
      onError={(event) => {
        if (event.currentTarget.src !== account.defaultAvatarDataUrl) {
          event.currentTarget.src = account.defaultAvatarDataUrl
        }
      }}
    />
  )

  return (
    <div ref={root} className={css.root}>
      {open && (
        <div className={clsx(css.menu, !wide && css.railMenu)} role="dialog" aria-label={t('account.menu')}>
          <div className={css.identity}>
            {avatarImage(css.identityAvatar)}
            <div className={css.identityText}>
              <strong>{account.user.displayName}</strong>
              <span>{account.user.company}</span>
            </div>
          </div>

          <div className={css.items}>
            <button type="button" className={css.actionRow}>
              <IconUserOutline16 size={16} />
              <span>{t('account.personal')}</span>
            </button>
            <button type="button" className={css.actionRow}>
              <IconAgentPresetOutline16 size={16} />
              <span>{t('account.team')}</span>
            </button>
            <button
              type="button"
              className={css.actionRow}
              onClick={() => {
                setOpen(false)
                openSettings()
              }}
            >
              <IconSettingsOutline16 size={16} />
              <span>{t('account.settings')}</span>
            </button>
            <button type="button" className={css.actionRow}>
              <IconDataOutline16 size={16} />
              <span>{t('account.coins')}</span>
              <span className={css.coinCount}>{t('account.coins.count').replace('{count}', String(account.user.coins))}</span>
            </button>
            <div className={css.divider} />
            <button type="button" className={css.actionRow} disabled={signingOut} onClick={() => { void signOut() }}>
              <IconRefreshOutline16 size={16} />
              <span>{t('account.logout')}</span>
            </button>
            {logoutFailed && <p className={css.error} role="alert">{t('account.logout.error')}</p>}
          </div>
        </div>
      )}

      <button
        type="button"
        className={clsx(css.trigger, !wide && css.railTrigger)}
        aria-label={wide ? undefined : t('account.menu')}
        aria-haspopup="dialog"
        aria-expanded={open}
        title={wide ? undefined : account.user.displayName}
        onClick={() => { setOpen(value => !value) }}
      >
        {avatarImage(css.triggerAvatar)}
        {wide && (
          <>
            <span className={css.triggerName}>{account.user.displayName}</span>
            <IconChevronDownOutline14 className={clsx(css.chevron, open && css.chevronOpen)} size={14} />
          </>
        )}
      </button>
    </div>
  )
}
