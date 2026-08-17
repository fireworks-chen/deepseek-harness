import { z } from 'zod'
import type { ShopwisHttpClient } from '../api/http-client.ts'

/**
 * Shopwis 桌面端登录接口定义。
 *
 * 本文件只维护短信验证码和短信登录两个接口的路径、请求参数、响应校验和字段命名转换；
 * 它不保存 Token、不控制窗口，也不决定登录会话是否持久化。
 */

const SEND_SMS_CODE_PATH = '/api/v1/company/user/send/sms/code'
const SMS_LOGIN_PATH = '/api/v1/company/user/sms/login'
const SMS_RETRY_AFTER_SECONDS = 60

const smsCodeResponseSchema = z.object({ code: z.literal(0), msg: z.string() })
const smsLoginResponseSchema = z.object({
  code: z.literal(0),
  msg: z.string(),
  data: z.object({
    token: z.string().min(1),
    info: z.object({
      id: z.number().int(),
      company_id: z.number().int(),
      company_name: z.string(),
      dept_id: z.number().int(),
      dept_name: z.string(),
      role_id: z.number().int(),
      role_name: z.string(),
      name: z.string(),
      avatar: z.string(),
      mobile: z.string(),
      status: z.number().int(),
      gender: z.number().int(),
      data_permission: z.number().int(),
      created_at: z.string(),
      updated_at: z.string(),
    }),
  }),
})

/** Shopwis 登录接口返回并完成字段命名转换后的公司用户信息。 */
export interface ShopwisLoginIdentity {
  id: number
  companyId: number
  companyName: string
  departmentId: number
  departmentName: string
  roleId: number
  roleName: string
  name: string
  avatarUrl?: string
  mobile: string
  status: number
  gender: number
  dataPermission: number
  createdAt: string
  updatedAt: string
}

/** Shopwis 短信登录成功后返回给认证服务的 Token 和用户信息。 */
export interface ShopwisDesktopLoginResult {
  accessToken: string
  identity: ShopwisLoginIdentity
}

/** 仅供 Electron 桌面端认证流程调用的 Shopwis 短信和登录接口。 */
export class DesktopAuthApi {
  /**
   * 将登录接口绑定到统一的 Shopwis HTTP 客户端。
   * @param client - 已配置部署地址和网络实现的 HTTP 客户端。
   */
  constructor(private readonly client: ShopwisHttpClient) {}

  /**
   * 请求向指定手机号发送短信验证码。
   * @param mobile - 用户输入的接收验证码手机号。
   * @returns 服务端接受请求后，登录界面使用的再次发送等待秒数。
   */
  async requestVerificationCode(mobile: string): Promise<{ retryAfterSeconds: number }> {
    const normalized = mobile.trim()
    if (normalized === '') throw new Error('请输入手机号')
    await this.client.postJson(
      SEND_SMS_CODE_PATH,
      { mobile: normalized },
      smsCodeResponseSchema,
      { authenticated: false },
    )
    return { retryAfterSeconds: SMS_RETRY_AFTER_SECONDS }
  }

  /**
   * 使用手机号和短信验证码换取登录 Token。
   * @param mobile - 用户输入的手机号。
   * @param code - 用户输入的短信验证码。
   * @returns 不透明 Token 以及完成字段命名转换的公司用户信息。
   */
  async login(mobile: string, code: string): Promise<ShopwisDesktopLoginResult> {
    const normalizedMobile = mobile.trim()
    const normalizedCode = code.trim()
    if (normalizedMobile === '' || normalizedCode === '') throw new Error('请输入手机号和验证码')
    const response = await this.client.postJson(
      SMS_LOGIN_PATH,
      { mobile: normalizedMobile, code: normalizedCode },
      smsLoginResponseSchema,
      { authenticated: false },
    )
    const info = response.data.info
    return {
      accessToken: response.data.token,
      identity: {
        id: info.id,
        companyId: info.company_id,
        companyName: info.company_name,
        departmentId: info.dept_id,
        departmentName: info.dept_name,
        roleId: info.role_id,
        roleName: info.role_name,
        name: info.name,
        ...(info.avatar.trim() === '' ? {} : { avatarUrl: info.avatar }),
        mobile: info.mobile,
        status: info.status,
        gender: info.gender,
        dataPermission: info.data_permission,
        createdAt: info.created_at,
        updatedAt: info.updated_at,
      },
    }
  }
}
