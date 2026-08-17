import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { safeStorage } from 'electron'
import type { AuthSession, SessionPersistence } from './session-manager.ts'

/**
 * Electron 登录会话的加密文件存储实现。
 *
 * 本文件只负责使用 `safeStorage` 加密、解密和删除会话文件；会话字段是否合法、Token 是否过期
 * 由 `DesktopSessionManager` 判断。
 */

/** 使用 Electron `safeStorage` 加密保存登录会话。 */
export class EncryptedSessionStorage implements SessionPersistence {
  /**
   * 延迟获取会话文件路径，避免在 Electron 准备完成前读取 `app.getPath('userData')`。
   * @param path - 返回当前用户数据目录中会话文件路径的函数。
   */
  constructor(private readonly path: () => string) {}

  /**
   * 在系统加密能力可用时读取并解密会话文件。
   * @returns 解密后的未知数据；文件不存在或无法使用系统加密时返回 `undefined`。
   */
  read(): unknown {
    const path = this.path()
    if (!existsSync(path) || !safeStorage.isEncryptionAvailable()) return undefined
    try {
      return JSON.parse(safeStorage.decryptString(readFileSync(path))) as unknown
    } catch {
      // 解密失败或 JSON 损坏时删除不可恢复文件，让应用安全地回到登录页。
      rmSync(path, { force: true })
      return undefined
    }
  }

  /**
   * 使用系统加密能力保存会话，并把文件权限限制为当前用户可读写。
   * @param session - 需要持久化的有效桌面登录会话。
   */
  write(session: AuthSession): void {
    // 系统不支持安全加密时仍保留内存会话，但不把明文 Token 写入磁盘。
    if (!safeStorage.isEncryptionAvailable()) return
    const path = this.path()
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, safeStorage.encryptString(JSON.stringify(session)), { mode: 0o600 })
  }

  /** 删除持久化会话文件；文件不存在时也视为清理成功。 */
  clear(): void {
    rmSync(this.path(), { force: true })
  }
}
