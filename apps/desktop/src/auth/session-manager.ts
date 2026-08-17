import type { ShopwisTokenProvider } from '../api/token-provider.ts'
import type { PublicUser } from '../contracts.ts'

/**
 * Electron 主进程中的登录会话管理器。
 *
 * 本文件是内存 Token 和账户会话的唯一管理者，负责恢复、结构校验、本地过期判断和清理；
 * 它通过持久化接口保存会话，但不知道底层是否使用文件或 Electron `safeStorage`。
 */

/** 只保留在 Electron 主进程和加密存储中的桌面登录会话。 */
export interface AuthSession {
  provider: 'shopwis'
  accessToken: string
  authenticatedAt: number
  expiresAt?: number
  user: PublicUser
}

/** 会话管理器使用的持久化接口，具体加密和文件操作由独立实现负责。 */
export interface SessionPersistence {
  read(): unknown
  write(session: AuthSession): void
  clear(): void
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

function parseSession(value: unknown): AuthSession | undefined {
  // 持久化文件属于不可信输入：旧 Mock 会话、缺少 Token 或账户字段异常时一律拒绝恢复。
  const session = record(value)
  const user = record(session?.user)
  if (
    typeof session?.accessToken !== 'string'
    || session.provider !== 'shopwis'
    || session.accessToken.trim() === ''
    || typeof session.authenticatedAt !== 'number'
    || !Number.isSafeInteger(session.authenticatedAt)
    || typeof user?.id !== 'string'
    || typeof user.phone !== 'string'
    || typeof user.displayName !== 'string'
    || typeof user.company !== 'string'
    || (user.coins !== undefined && (
      typeof user.coins !== 'number'
      || !Number.isSafeInteger(user.coins)
      || user.coins < 0
    ))
    || (user.avatarUrl !== undefined && typeof user.avatarUrl !== 'string')
    || (session.expiresAt !== undefined && (
      typeof session.expiresAt !== 'number'
      || !Number.isSafeInteger(session.expiresAt)
    ))
  ) return undefined
  return value as AuthSession
}

/**
 * 尝试读取 JWT 的 `exp` 字段，同时允许服务端返回不透明 Token。
 * @param accessToken - Shopwis 登录接口返回的 Token。
 * @returns Token 包含合法 JWT 过期时间时返回毫秒时间戳，否则返回 `undefined`。
 */
export function accessTokenExpiresAt(accessToken: string): number | undefined {
  const payload = accessToken.split('.')[1]
  if (payload === undefined || payload === '') return undefined
  try {
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as unknown
    const exp = record(decoded)?.exp
    if (typeof exp !== 'number' || !Number.isSafeInteger(exp) || exp <= 0) return undefined
    const milliseconds = exp * 1000
    return Number.isSafeInteger(milliseconds) ? milliseconds : undefined
  } catch {
    return undefined
  }
}

function expired(session: AuthSession, now = Date.now()): boolean {
  return session.expiresAt !== undefined && session.expiresAt <= now
}

/**
 * 桌面端 Token 和账户会话的唯一管理者，同时向 HTTP 层提供最小 Token 读取接口。
 * Token 不会通过 preload IPC 暴露给 Renderer。
 */
export class DesktopSessionManager implements ShopwisTokenProvider {
  private active: AuthSession | undefined

  /**
   * 将会话管理器绑定到一个持久化实现。
   * @param persistence - 负责读取、写入和清理会话的持久化对象。
   */
  constructor(private readonly persistence: SessionPersistence) {}

  /**
   * 恢复结构合法且尚未过期的持久化会话。
   * @returns 可恢复的会话；数据无效或已过期时清理持久化内容并返回 `undefined`。
   */
  restore(): AuthSession | undefined {
    const restored = parseSession(this.persistence.read())
    if (restored === undefined || expired(restored)) {
      this.persistence.clear()
      this.active = undefined
      return undefined
    }
    this.active = restored
    return this.active
  }

  /**
   * 返回当前有效会话；发现本地可判断的过期状态时先清理会话。
   * @returns 当前有效会话或 `undefined`。
   */
  current(): AuthSession | undefined {
    if (this.active !== undefined && expired(this.active)) {
      this.clear()
      return undefined
    }
    return this.active
  }

  /**
   * 为受保护 Shopwis 请求返回当前 Token，且不把 Token 传给 Renderer。
   * @returns 当前有效 Token 或 `undefined`。
   */
  getAccessToken(): string | undefined {
    if (this.active !== undefined && expired(this.active)) {
      this.clear()
      return undefined
    }
    return this.active?.accessToken
  }

  /**
   * 发布登录成功后的内存会话，并根据用户选择决定是否持久化。
   * @param session - 已完成字段转换和 Token 解析的登录会话。
   * @param remember - 是否让加密会话在应用重启后继续有效。
   */
  set(session: AuthSession, remember: boolean): void {
    this.active = session
    if (remember) this.persistence.write(session)
    else this.persistence.clear()
  }

  /** 同时清理内存 Token 和持久化会话。 */
  clear(): void {
    this.active = undefined
    this.persistence.clear()
  }
}
