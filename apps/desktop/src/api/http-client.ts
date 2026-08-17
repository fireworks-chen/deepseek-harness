import { z, type ZodType } from 'zod'
import { ShopwisApiError } from './api-error.ts'
import type { ShopwisTokenProvider } from './token-provider.ts'

/**
 * Shopwis 桌面端通用 HTTP 请求层。
 *
 * 本文件只处理 HTTPS 地址校验、Token 注入、超时、HTTP 状态、Shopwis 通用响应字段和响应校验；
 * 它不知道短信登录等具体业务接口，也不负责保存或清理登录会话。
 */

const DEFAULT_TIMEOUT_MS = 15_000
const envelopeSchema = z.object({ code: z.number().int(), msg: z.string() })

/** Electron 主进程或测试代码注入的 Fetch 兼容请求函数。 */
export type ShopwisFetch = (input: string | URL, init?: RequestInit) => Promise<Response>

/** 创建 Shopwis HTTP 客户端需要的部署配置和会话依赖。 */
export interface ShopwisHttpClientOptions {
  baseUrl: string
  fetch: ShopwisFetch
  tokenProvider?: ShopwisTokenProvider
  onUnauthorized?: () => void | Promise<void>
  timeoutMs?: number
}

/** 单次请求是否携带登录凭证及其取消信号。 */
export interface ShopwisRequestOptions {
  authenticated?: boolean
  signal?: AbortSignal
}

function parseHttpsOrigin(value: string): string {
  try {
    const parsed = new URL(value)
    if (
      parsed.protocol !== 'https:'
      || parsed.username !== ''
      || parsed.password !== ''
      || parsed.pathname !== '/'
      || parsed.search !== ''
      || parsed.hash !== ''
    ) throw new Error('not an HTTPS origin')
    return parsed.origin
  } catch {
    throw new Error('Shopwis API base URL must be an HTTPS origin')
  }
}

function parseTimeout(value: number | undefined): number {
  if (value === undefined) return DEFAULT_TIMEOUT_MS
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error('Shopwis API timeout must be a positive integer')
  }
  return value
}

function messageFrom(value: unknown, fallback: string): string {
  if (typeof value !== 'object' || value === null) return fallback
  const message = (value as Record<string, unknown>).msg
  return typeof message === 'string' && message.trim() !== '' ? message : fallback
}

type ParsedJson =
  | { ok: true; value: unknown }
  | { ok: false; error: unknown }

async function parseJson(response: Response): Promise<ParsedJson> {
  const text = await response.text()
  try {
    return { ok: true, value: JSON.parse(text) as unknown }
  } catch (error) {
    return { ok: false, error }
  }
}

function requestUrl(path: string, baseUrl: string): URL {
  if (!path.startsWith('/') || path.startsWith('//')) {
    throw new Error('Shopwis API path must begin with one slash')
  }
  const url = new URL(path, baseUrl)
  // URL 会把反斜杠标准化为斜杠，因此必须再次检查 origin，防止路径把请求导向其他域名。
  if (url.origin !== baseUrl) throw new Error('Shopwis API path must remain on the configured origin')
  return url
}

function requestSignal(timeoutMs: number, upstream: AbortSignal | undefined): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs)
  return upstream === undefined ? timeout : AbortSignal.any([upstream, timeout])
}

/** 登录接口和后续桌面端 Shopwis 业务接口共用的 JSON 请求客户端。 */
export class ShopwisHttpClient {
  private readonly baseUrl: string
  private readonly fetch: ShopwisFetch
  private readonly tokenProvider: ShopwisTokenProvider | undefined
  private readonly onUnauthorized: () => void | Promise<void>
  private readonly timeoutMs: number

  /**
   * 将客户端绑定到一个 Shopwis 部署地址和桌面会话管理器。
   * @param options - 请求地址、超时、网络实现、Token 提供者和登录失效回调。
   */
  constructor(options: ShopwisHttpClientOptions) {
    this.baseUrl = parseHttpsOrigin(options.baseUrl)
    this.fetch = options.fetch
    this.tokenProvider = options.tokenProvider
    this.onUnauthorized = options.onUnauthorized ?? (() => {})
    this.timeoutMs = parseTimeout(options.timeoutMs)
  }

  /**
   * 发送 POST JSON 请求，并校验 Shopwis 成功响应。
   * @param path - 配置域名下以单个斜杠开头的 API 路径。
   * @param body - 可以序列化为 JSON 的请求参数。
   * @param successSchema - 用于校验 `code === 0` 成功响应的 Zod Schema。
   * @param options - 本次请求的登录凭证和取消控制。
   * @returns 经过通用字段和业务 Schema 双重校验的响应。
   */
  async postJson<T>(
    path: string,
    body: unknown,
    successSchema: ZodType<T>,
    options: ShopwisRequestOptions = {},
  ): Promise<T> {
    const url = requestUrl(path, this.baseUrl)
    const authenticated = options.authenticated ?? true
    // 每次发送请求前读取最新 Token，避免复用登录、退出或刷新之前缓存的旧值。
    const token = authenticated ? (await this.tokenProvider?.getAccessToken())?.trim() : undefined
    if (authenticated && (token === undefined || token === '')) {
      await this.onUnauthorized()
      throw new ShopwisApiError('请先登录', { kind: 'authentication' })
    }

    let response: Response
    try {
      response = await this.fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(token === undefined ? {} : { authorization: `Bearer ${token}` }),
        },
        body: JSON.stringify(body),
        signal: requestSignal(this.timeoutMs, options.signal),
      })
    } catch (error) {
      throw new ShopwisApiError('网络连接失败，请稍后重试', { kind: 'network', cause: error })
    }

    const parsedJson = await parseJson(response)
    const payload = parsedJson.ok ? parsedJson.value : undefined
    // 先处理 HTTP 401，确保服务端即使返回空正文或非 JSON，也会清理失效会话并返回登录页。
    if (response.status === 401 && authenticated) {
      await this.onUnauthorized()
      throw new ShopwisApiError(messageFrom(payload, '登录状态已失效，请重新登录'), {
        kind: 'authentication',
        status: response.status,
      })
    }
    // 非成功 HTTP 状态优先作为传输错误处理；错误正文不是 JSON 时使用安全的默认提示。
    if (!response.ok) {
      throw new ShopwisApiError(messageFrom(payload, `请求失败（${String(response.status)}）`), {
        kind: 'http',
        status: response.status,
      })
    }
    // 只有 HTTP 成功响应才强制要求合法 JSON，防止把无法验证的数据交给业务层。
    if (!parsedJson.ok) {
      throw new ShopwisApiError('服务返回了无法识别的数据', {
        kind: 'invalid-response',
        status: response.status,
        cause: parsedJson.error,
      })
    }

    const envelope = envelopeSchema.safeParse(payload)
    if (!envelope.success) {
      throw new ShopwisApiError('服务返回了无法识别的数据', {
        kind: 'invalid-response',
        status: response.status,
        cause: envelope.error,
      })
    }
    if (envelope.data.code !== 0) {
      throw new ShopwisApiError(envelope.data.msg.trim() || '请求未成功', {
        kind: 'business',
        status: response.status,
        businessCode: envelope.data.code,
      })
    }

    const parsed = successSchema.safeParse(payload)
    if (!parsed.success) {
      throw new ShopwisApiError('服务返回了无法识别的数据', {
        kind: 'invalid-response',
        status: response.status,
        cause: parsed.error,
      })
    }
    return parsed.data
  }
}
