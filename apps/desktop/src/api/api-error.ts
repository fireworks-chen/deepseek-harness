/**
 * Shopwis 桌面端请求的统一错误定义。
 *
 * 本文件只负责描述上层可以识别和展示的错误，不保存请求参数、验证码、Token 或原始响应正文。
 */

/** Shopwis 请求失败的分类，供登录流程和后续业务接口进行统一判断。 */
export type ShopwisApiErrorKind =
  | 'authentication'
  | 'business'
  | 'http'
  | 'invalid-response'
  | 'network'

/** 创建 Shopwis 请求错误时附带的机器可读信息。 */
export interface ShopwisApiErrorOptions {
  kind: ShopwisApiErrorKind
  status?: number
  businessCode?: number
  cause?: unknown
}

/** 已脱敏的 Shopwis 请求错误，可以安全地传递给桌面端登录界面展示。 */
export class ShopwisApiError extends Error {
  readonly kind: ShopwisApiErrorKind
  readonly status?: number
  readonly businessCode?: number

  /**
   * 创建统一错误，不保留凭证、请求正文和原始响应正文。
   * @param message - 可以展示给用户的错误信息。
   * @param options - 错误分类、HTTP 状态码、业务状态码和底层异常。
   */
  constructor(message: string, options: ShopwisApiErrorOptions) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause })
    this.name = 'ShopwisApiError'
    this.kind = options.kind
    if (options.status !== undefined) this.status = options.status
    if (options.businessCode !== undefined) this.businessCode = options.businessCode
  }
}
