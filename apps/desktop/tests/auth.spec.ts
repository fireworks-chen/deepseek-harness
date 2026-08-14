import { describe, expect, it } from 'vitest'
import { MockAuthProvider } from '../src/auth.ts'
import type { MockAuthConfig } from '../src/config.ts'

const config: MockAuthConfig = {
  email: 'demo@example.com',
  displayName: '陈志勇',
  company: '武汉市宇权通信科技有限公司',
  coins: 211,
  plan: '本地开发版',
  permissions: {
    models: ['deepseek-chat'],
    tools: ['builtin:*'],
    skills: ['builtin:*'],
    plugins: ['builtin:*'],
  },
}

describe('desktop mock phone authentication', () => {
  it('accepts any non-empty phone and verification code', async () => {
    const provider = new MockAuthProvider(config)

    const session = await provider.login({
      phone: '19912345678',
      verificationCode: '9870',
      remember: true,
    })

    expect(session.user.phone).toBe('19912345678')
    expect(session.accessToken).toMatch(/^mock\./)
  })

  it('rejects blank credentials', async () => {
    const provider = new MockAuthProvider(config)

    await expect(provider.login({
      phone: ' ',
      verificationCode: '123456',
      remember: true,
    })).rejects.toThrow('请输入手机号和验证码')
  })

  it('returns a local retry interval without contacting a service', async () => {
    const provider = new MockAuthProvider(config)

    await expect(provider.requestVerificationCode('18812345678')).resolves.toEqual({
      retryAfterSeconds: 60,
    })
  })
})
