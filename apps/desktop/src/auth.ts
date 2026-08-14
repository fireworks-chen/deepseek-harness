import { createHash, randomBytes } from 'node:crypto'
import type { LoginInput, PublicUser } from './contracts.ts'
import type { MockAuthConfig } from './config.ts'

export interface AuthSession {
  accessToken: string
  expiresAt: number
  user: PublicUser
}

export interface AuthProvider {
  login(input: LoginInput): Promise<AuthSession>
  requestVerificationCode(phone: string): Promise<{ retryAfterSeconds: number }>
}

export class MockAuthProvider implements AuthProvider {
  constructor(private readonly config: MockAuthConfig) {}

  async requestVerificationCode(phone: string): Promise<{ retryAfterSeconds: number }> {
    await new Promise(resolve => setTimeout(resolve, 200))
    if (phone.trim() === '') throw new Error('请输入手机号')
    return { retryAfterSeconds: 60 }
  }

  async login(input: LoginInput): Promise<AuthSession> {
    await new Promise(resolve => setTimeout(resolve, 300))
    const phone = input.phone.trim()
    if (phone === '' || input.verificationCode.trim() === '') throw new Error('请输入手机号和验证码')
    const id = createHash('sha256').update(phone).digest('hex').slice(0, 16)
    return {
      accessToken: `mock.${randomBytes(32).toString('base64url')}`,
      expiresAt: Date.now() + 60 * 60 * 1000,
      user: {
        id: `mock_${id}`,
        email: this.config.email,
        phone,
        displayName: this.config.displayName,
        company: this.config.company,
        ...this.config.avatarUrl === undefined ? {} : { avatarUrl: this.config.avatarUrl },
        coins: this.config.coins,
        plan: this.config.plan,
        permissions: this.config.permissions,
      },
    }
  }
}
