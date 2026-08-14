// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { AccountMenu } from '../src/client/AccountMenu.tsx'
import type { DesktopAccountSnapshot } from '../src/client/shell-contract.ts'
import { en } from '../src/client/locales.ts'

afterEach(cleanup)

const account: DesktopAccountSnapshot = {
  user: {
    displayName: 'Chen Zhiyong',
    company: 'Wuhan Yuquan Communication Technology Co., Ltd.',
    coins: 211,
  },
  defaultAvatarDataUrl: 'data:image/png;base64,default-avatar',
}

const t = (key: keyof typeof en): string => en[key]

describe('Electron account menu', () => {
  it('opens account information and routes Settings through the existing panel action', () => {
    const openSettings = vi.fn()
    render(<AccountMenu wide account={account} t={t} openSettings={openSettings} logout={vi.fn()} />)

    const trigger = screen.getByRole('button', { name: 'Chen Zhiyong' })
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    expect(trigger.querySelector('img')?.getAttribute('src')).toBe(account.defaultAvatarDataUrl)
    fireEvent.click(trigger)

    expect(screen.getByRole('dialog', { name: 'Account menu' })).toBeTruthy()
    expect(screen.getByText(account.user.company)).toBeTruthy()
    expect(screen.getByText('Personal profile')).toBeTruthy()
    expect(screen.getByText('Team management')).toBeTruthy()
    expect(screen.getByText('My coins')).toBeTruthy()
    expect(screen.getByText('211')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Settings' }))
    expect(openSettings).toHaveBeenCalledOnce()
    expect(screen.queryByRole('dialog', { name: 'Account menu' })).toBeNull()
  })

  it('closes on Escape and an outside pointer press', () => {
    render(<AccountMenu wide account={account} t={t} openSettings={vi.fn()} logout={vi.fn()} />)
    const trigger = screen.getByRole('button', { name: 'Chen Zhiyong' })
    fireEvent.click(trigger)
    fireEvent.keyDown(document, { key: 'Enter' })
    expect(screen.getByRole('dialog', { name: 'Account menu' })).toBeTruthy()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: 'Account menu' })).toBeNull()

    fireEvent.click(trigger)
    fireEvent.pointerDown(screen.getByText('Personal profile'))
    expect(screen.getByRole('dialog', { name: 'Account menu' })).toBeTruthy()
    fireEvent.pointerDown(document.body)
    expect(screen.queryByRole('dialog', { name: 'Account menu' })).toBeNull()
  })

  it('uses the supplied default avatar after a custom avatar fails', () => {
    const custom: DesktopAccountSnapshot = {
      ...account,
      user: { ...account.user, avatarUrl: 'https://example.com/missing.png' },
    }
    render(<AccountMenu wide={false} account={custom} t={t} openSettings={vi.fn()} logout={vi.fn()} />)
    const trigger = screen.getByRole('button', { name: 'Account menu' })
    expect(trigger.getAttribute('title')).toBe('Chen Zhiyong')
    const image = trigger.querySelector('img')!
    expect(image.getAttribute('src')).toBe(custom.user.avatarUrl)
    fireEvent.error(image)
    expect(image.getAttribute('src')).toBe(custom.defaultAvatarDataUrl)
    fireEvent.error(image)
    expect(image.getAttribute('src')).toBe(custom.defaultAvatarDataUrl)
    fireEvent.click(trigger)
    expect(screen.getByRole('dialog', { name: 'Account menu' })).toBeTruthy()
  })

  it('uses the supplied default avatar when the configured avatar is blank', () => {
    const blankAvatar: DesktopAccountSnapshot = {
      ...account,
      user: { ...account.user, avatarUrl: '   ' },
    }
    render(<AccountMenu wide account={blankAvatar} t={t} openSettings={vi.fn()} logout={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Chen Zhiyong' }).querySelector('img')?.getAttribute('src'))
      .toBe(blankAvatar.defaultAvatarDataUrl)
  })

  it('locks repeated sign-out calls and reports a rejected logout', async () => {
    const pending = Promise.withResolvers<undefined>()
    const logout = vi.fn(() => pending.promise)
    render(<AccountMenu wide account={account} t={t} openSettings={vi.fn()} logout={logout} />)
    fireEvent.click(screen.getByRole('button', { name: 'Chen Zhiyong' }))
    const button = screen.getByRole('button', { name: 'Sign out' })
    fireEvent.click(button)
    fireEvent.click(button)
    expect(logout).toHaveBeenCalledOnce()
    expect(button.hasAttribute('disabled')).toBe(true)
    pending.reject(new Error('offline'))
    expect((await screen.findByRole('alert')).textContent).toBe('Could not sign out. Try again.')
    await waitFor(() => { expect(button.hasAttribute('disabled')).toBe(false) })
  })
})
