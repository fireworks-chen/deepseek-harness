import type { IpcMain } from 'electron'
import type { DesktopAuthService } from '../auth/auth-service.ts'
import type { AuthSession, DesktopSessionManager } from '../auth/session-manager.ts'
import type { LoginInput, LoginResult, VerificationCodeResult } from '../contracts.ts'

/**
 * Renderer 到 Electron 主进程的认证 IPC 入口。
 *
 * Renderer 传入的数据属于不可信输入，本文件负责基础类型校验和登录生命周期编排；
 * 具体 HTTP 请求、响应字段转换、Token 管理和加密存储分别交给对应模块处理。
 */

/** 注册验证码和登录 IPC 所需的认证及窗口生命周期依赖。 */
export interface AuthIpcOptions {
  ipcMain: IpcMain
  auth: DesktopAuthService
  sessions: DesktopSessionManager
  showWorkspace: (session: AuthSession) => Promise<void>
  stopBackend: () => Promise<void>
  refreshMenu: () => void
}

function parseLoginInput(input: unknown): LoginInput | undefined {
  // preload 的 TypeScript 类型不能代替运行时校验，主进程必须重新检查 Renderer 输入。
  if (typeof input !== 'object' || input === null) return undefined
  const candidate = input as Record<string, unknown>
  if (
    typeof candidate.phone !== 'string'
    || typeof candidate.verificationCode !== 'string'
    || typeof candidate.remember !== 'boolean'
  ) return undefined
  return {
    phone: candidate.phone,
    verificationCode: candidate.verificationCode,
    remember: candidate.remember,
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * 注册发送短信验证码和短信登录操作。
 * @param options - 认证服务、会话管理器以及登录成功或失败时的窗口和后端生命周期操作。
 */
export function installAuthIpc(options: AuthIpcOptions): void {
  options.ipcMain.handle(
    'desktop:request-verification-code',
    async (_event, input: unknown): Promise<VerificationCodeResult> => {
      if (typeof input !== 'string' || input.trim() === '') return { ok: false, message: '请输入手机号' }
      try {
        const result = await options.auth.requestVerificationCode(input)
        return { ok: true, retryAfterSeconds: result.retryAfterSeconds }
      } catch (error) {
        return { ok: false, message: errorMessage(error) }
      }
    },
  )
  options.ipcMain.handle('desktop:login', async (_event, input: unknown): Promise<LoginResult> => {
    const loginInput = parseLoginInput(input)
    if (loginInput === undefined) return { ok: false, message: '登录参数无效' }
    try {
      const authenticated = await options.auth.login(loginInput)
      // 只有接口和响应转换全部成功后才发布会话，再启动需要登录身份的内置后端。
      options.sessions.set(authenticated, loginInput.remember)
      await options.showWorkspace(authenticated)
      options.refreshMenu()
      return { ok: true, user: authenticated.user }
    } catch (error) {
      // 登录或工作区启动任一步失败都回滚 Token 和后端，避免保留半登录状态。
      options.sessions.clear()
      await options.stopBackend()
      return { ok: false, message: errorMessage(error) }
    }
  })
}
