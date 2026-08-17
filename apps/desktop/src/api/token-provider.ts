/**
 * 受保护 Shopwis 请求读取 Token 的最小接口。
 *
 * HTTP 层只依赖此接口，不了解 Token 的保存方式、会话字段或 Electron `safeStorage`，
 * 从而避免请求层直接控制桌面登录状态。
 */
export interface ShopwisTokenProvider {
  /**
   * 在请求发送前返回当前 Token；没有有效登录会话时返回 `undefined`。
   * @returns 当前不透明 Token、`undefined`，或对应的异步结果。
   */
  getAccessToken(): string | undefined | Promise<string | undefined>
}
