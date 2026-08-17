import type { LoginInput } from '../contracts.ts'
import { accessTokenExpiresAt, type AuthSession } from './session-manager.ts'
import type { DesktopAuthApi } from './auth-api.ts'

/**
 * 桌面端认证业务编排层。
 *
 * 本文件把登录接口结果转换为桌面会话和账户展示数据，但不负责网络细节、Token 持久化、
 * IPC 参数校验或窗口跳转。
 */

/** 基于独立登录接口完成桌面端认证和会话数据转换。 */
export class DesktopAuthService {
  /**
   * 将认证流程绑定到桌面端登录接口。
   * @param api - 只包含短信和登录操作的 Shopwis 接口对象。
   */
  constructor(private readonly api: DesktopAuthApi) {}

  /**
   * 发送短信验证码，但不创建或修改登录会话。
   * @param phone - 用户输入的手机号。
   * @returns 登录界面再次发送验证码的等待秒数。
   */
  requestVerificationCode(phone: string): Promise<{ retryAfterSeconds: number }> {
    return this.api.requestVerificationCode(phone)
  }

  /**
   * 完成短信登录，并把服务端用户信息转换成桌面端会话。
   * @param input - 已通过 IPC 基础类型校验的手机号、验证码和记住登录选项。
   * @returns Token 保留在 Electron 主进程中的桌面端会话。
   */
  async login(input: LoginInput): Promise<AuthSession> {
    const result = await this.api.login(input.phone, input.verificationCode)
    const identity = result.identity
    const phone = identity.mobile.trim() || input.phone.trim()
    const expiresAt = accessTokenExpiresAt(result.accessToken)
    return {
      provider: 'shopwis',
      accessToken: result.accessToken,
      authenticatedAt: Date.now(),
      ...(expiresAt === undefined ? {} : { expiresAt }),
      user: {
        id: String(identity.id),
        phone,
        displayName: identity.name.trim() || phone,
        company: identity.companyName,
        ...(identity.avatarUrl === undefined ? {} : { avatarUrl: identity.avatarUrl }),
      },
    }
  }
}
