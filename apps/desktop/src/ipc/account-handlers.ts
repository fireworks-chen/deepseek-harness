import type { IpcMain } from 'electron'
import type { DesktopSessionManager } from '../auth/session-manager.ts'
import type { DesktopAccountSnapshot, DesktopBootstrap, PublicBrand } from '../contracts.ts'

/**
 * Renderer 可读取的品牌和账户 IPC。
 *
 * 本文件只返回公开品牌配置和脱敏账户信息，并协调退出登录；任何响应都不包含 Token、
 * 加密会话内容或 Shopwis 原始用户数据。
 */

/** 注册品牌、账户和退出登录 IPC 所需的主进程依赖。 */
export interface AccountIpcOptions {
  ipcMain: IpcMain
  brand: PublicBrand
  sessions: DesktopSessionManager
  logout: () => Promise<void>
}

/**
 * 注册可以安全暴露给 Renderer 的品牌、账户和退出登录操作。
 * @param options - 公开品牌配置、会话管理器和完整退出登录流程。
 */
export function installAccountIpc(options: AccountIpcOptions): void {
  options.ipcMain.handle('desktop:bootstrap', (): DesktopBootstrap => ({ brand: options.brand }))
  options.ipcMain.handle('desktop:account', (): DesktopAccountSnapshot | undefined => {
    const session = options.sessions.current()
    // 这里只投影 Renderer 展示需要的账户字段，Token 始终留在主进程。
    return session === undefined
      ? undefined
      : { user: session.user, defaultAvatarDataUrl: options.brand.defaultAvatarDataUrl }
  })
  options.ipcMain.handle('desktop:logout', async (): Promise<void> => { await options.logout() })
}
