// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { DesktopBridge, PublicBrand, PublicUser } from '../src/contracts.ts'
import { LoginApp } from '../src/renderer/LoginApp.tsx'

afterEach(cleanup)

const brand: PublicBrand = {
  productName: 'Agent Studio',
  displayName: 'Agent Studio',
  tagline: '你的智能工作空间',
  logoDataUrl: 'data:image/svg+xml;base64,logo',
  defaultAvatarDataUrl: 'data:image/png;base64,avatar',
  accentColor: '#1769e0',
  supportEmail: 'support@example.com',
  authMode: 'shopwis',
  clientBaseUrl: 'https://client-test.shopwis.cn',
  userAgreementUrl: 'https://client-test.shopwis.cn/user-agreement',
  privacyPolicyUrl: 'https://client-test.shopwis.cn/privacy-policy',
}

const user: PublicUser = {
  id: '42',
  phone: '18812345678',
  displayName: '陈志勇',
  company: '武汉市宇权通信科技有限公司',
}

function installBridge(overrides: Partial<DesktopBridge> = {}): DesktopBridge {
  const bridge: DesktopBridge = {
    bootstrap: () => Promise.resolve({ brand }),
    requestVerificationCode: () => Promise.resolve({ ok: true, retryAfterSeconds: 60 }),
    login: () => Promise.resolve({ ok: true, user }),
    account: () => Promise.resolve(undefined),
    logout: () => Promise.resolve(),
    ...overrides,
  }
  Object.defineProperty(window, 'desktop', { configurable: true, value: bridge })
  return bridge
}

describe('desktop phone verification login', () => {
  it('renders the approved copy and policy links', async () => {
    installBridge()
    render(createElement(LoginApp))

    expect(await screen.findByRole('heading', { name: '欢迎登录用户端' })).toBeTruthy()
    expect(screen.getByText('要出海·有货就能出海')).toBeTruthy()
    expect(screen.getByLabelText('手机号').getAttribute('placeholder')).toBe('请输入手机号')
    expect(screen.getByLabelText('验证码').getAttribute('placeholder')).toBe('请输入验证码')
    expect(screen.getByRole('link', { name: '《服务条款》' }).getAttribute('href')).toBe(brand.userAgreementUrl)
    expect(screen.getByRole('link', { name: '《隐私政策》' }).getAttribute('href')).toBe(brand.privacyPolicyUrl)
  })

  it('runs the local code-request countdown', async () => {
    installBridge()
    render(createElement(LoginApp))
    fireEvent.change(await screen.findByLabelText('手机号'), { target: { value: '18812345678' } })
    fireEvent.click(screen.getByRole('button', { name: '获取验证码' }))

    expect(await screen.findByRole('button', { name: '60 秒后重试' })).toBeTruthy()
  })

  it('submits phone credentials through the desktop bridge', async () => {
    const login = vi.fn(() => Promise.resolve({ ok: true as const, user }))
    installBridge({ login })
    render(createElement(LoginApp))

    fireEvent.change(await screen.findByLabelText('手机号'), { target: { value: '16600001111' } })
    fireEvent.change(screen.getByLabelText('验证码'), { target: { value: '7788' } })
    fireEvent.click(screen.getByRole('button', { name: '登录' }))

    await waitFor(() => {
      expect(login).toHaveBeenCalledWith({
        phone: '16600001111',
        verificationCode: '7788',
        remember: true,
      })
    })
  })
})
