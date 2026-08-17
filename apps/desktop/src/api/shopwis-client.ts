import { ShopwisHttpClient, type ShopwisFetch } from './http-client.ts'
import type { DesktopSessionManager } from '../auth/session-manager.ts'

/**
 * Shopwis HTTP 客户端在 Electron 主进程中的装配入口。
 *
 * 本文件只负责把 Electron 网络实现、桌面会话管理器和登录失效回调连接到通用 HTTP 客户端，
 * 不包含任何具体接口地址或业务处理。
 */

/** Electron 桌面端装配 Shopwis HTTP 客户端所需的依赖。 */
export interface DesktopShopwisClientOptions {
  baseUrl: string
  timeoutMs: number
  fetch: ShopwisFetch
  sessions: DesktopSessionManager
  onUnauthorized: () => void | Promise<void>
}

/**
 * 创建使用 Electron 网络层和桌面会话管理器的 Shopwis 客户端。
 * @param options - 部署地址、网络实现、会话管理器和登录失效回调。
 * @returns 可供登录接口及后续桌面端业务接口复用的 HTTP 客户端。
 */
export function createDesktopShopwisClient(options: DesktopShopwisClientOptions): ShopwisHttpClient {
  return new ShopwisHttpClient({
    baseUrl: options.baseUrl,
    timeoutMs: options.timeoutMs,
    fetch: options.fetch,
    tokenProvider: options.sessions,
    onUnauthorized: options.onUnauthorized,
  })
}
