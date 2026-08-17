import { Buffer } from 'node:buffer'
import { describe, expect, it } from 'vitest'
import {
  accessTokenExpiresAt,
  DesktopSessionManager,
  type AuthSession,
  type SessionPersistence,
} from '../src/auth/session-manager.ts'

class MemoryPersistence implements SessionPersistence {
  value: unknown = undefined
  clears = 0

  read(): unknown { return this.value }
  write(session: AuthSession): void { this.value = session }
  clear(): void { this.value = undefined; this.clears += 1 }
}

function jwt(exp: number): string {
  const header = Buffer.from(JSON.stringify({ alg: 'none' })).toString('base64url')
  const payload = Buffer.from(JSON.stringify({ exp })).toString('base64url')
  return `${header}.${payload}.signature`
}

function session(accessToken: string, expiresAt?: number): AuthSession {
  return {
    provider: 'shopwis',
    accessToken,
    authenticatedAt: Date.now(),
    ...(expiresAt === undefined ? {} : { expiresAt }),
    user: {
      id: '42',
      phone: '18812345678',
      displayName: '测试用户',
      company: 'Shopwis',
    },
  }
}

describe('desktop session manager', () => {
  it('returns no session when encrypted persistence contains no token', () => {
    const persistence = new MemoryPersistence()
    const sessions = new DesktopSessionManager(persistence)

    expect(sessions.restore()).toBeUndefined()
    expect(sessions.getAccessToken()).toBeUndefined()
  })

  it('removes an expired persisted session before workspace startup', () => {
    const persistence = new MemoryPersistence()
    persistence.value = session('expired-token', Date.now() - 1)
    const sessions = new DesktopSessionManager(persistence)

    expect(sessions.restore()).toBeUndefined()
    expect(persistence.value).toBeUndefined()
  })

  it('persists only a real authenticated session and exposes its opaque token', () => {
    const persistence = new MemoryPersistence()
    const sessions = new DesktopSessionManager(persistence)
    const active = session('server-token')

    sessions.set(active, true)

    expect(persistence.value).toBe(active)
    expect(sessions.getAccessToken()).toBe('server-token')
  })

  it('reads a JWT expiration claim while accepting opaque tokens', () => {
    const expiresAtSeconds = Math.floor(Date.now() / 1000) + 3600

    expect(accessTokenExpiresAt(jwt(expiresAtSeconds))).toBe(expiresAtSeconds * 1000)
    expect(accessTokenExpiresAt('opaque-server-token')).toBeUndefined()
  })
})
