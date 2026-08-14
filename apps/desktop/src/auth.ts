import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import type { LoginInput, PublicUser } from './contracts.ts'
import type { MockAuthConfig } from './config.ts'

export interface AuthSession {
  accessToken: string
  expiresAt: number
  user: PublicUser
}

export interface AuthProvider {
  login(input: LoginInput): Promise<AuthSession>
}

function digest(value: string): Buffer {
  return createHash('sha256').update(value).digest()
}

function equalSecret(left: string, right: string): boolean {
  return timingSafeEqual(digest(left), digest(right))
}

export class MockAuthProvider implements AuthProvider {
  constructor(private readonly config: MockAuthConfig) {}

  async login(input: LoginInput): Promise<AuthSession> {
    await new Promise(resolve => setTimeout(resolve, 300))
    const emailMatches = input.email.trim().toLowerCase() === this.config.email.trim().toLowerCase()
    if (!emailMatches || !equalSecret(input.password, this.config.password)) {
      throw new Error('邮箱或密码不正确')
    }
    const id = createHash('sha256').update(this.config.email.toLowerCase()).digest('hex').slice(0, 16)
    return {
      accessToken: `mock.${randomBytes(32).toString('base64url')}`,
      expiresAt: Date.now() + 60 * 60 * 1000,
      user: {
        id: `mock_${id}`,
        email: this.config.email,
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
