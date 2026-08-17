import { describe, expect, it, vi } from 'vitest'
import { ShopwisHttpClient } from '../src/api/http-client.ts'
import { DesktopAuthApi } from '../src/auth/auth-api.ts'
import { DesktopAuthService } from '../src/auth/auth-service.ts'

function loginResponse(token = 'opaque-server-token') {
  return {
    code: 0,
    data: {
      info: {
        avatar: 'https://cdn.example.com/avatar.png',
        company_id: 8,
        company_name: 'Shopwis',
        created_at: '2026-08-13T09:54:38+08:00',
        data_permission: 2,
        dept_id: 3,
        dept_name: '外贸部',
        gender: 0,
        id: 42,
        mobile: '18812345678',
        name: '测试用户',
        role_id: 5,
        role_name: '管理员',
        status: 1,
        updated_at: '2026-08-13T09:54:38+08:00',
      },
      token,
    },
    msg: '',
  }
}

function client(fetch: (input: string | URL, init?: RequestInit) => Promise<Response>): ShopwisHttpClient {
  return new ShopwisHttpClient({ baseUrl: 'https://client-test.shopwis.cn', fetch })
}

describe('desktop Shopwis authentication', () => {
  it('sends the documented SMS-code request without a token', async () => {
    const fetch = vi.fn<(input: string | URL, init?: RequestInit) => Promise<Response>>(
      () => Promise.resolve(Response.json({ code: 0, msg: '' })),
    )
    const api = new DesktopAuthApi(client(fetch))

    await expect(api.requestVerificationCode(' 18812345678 ')).resolves.toEqual({
      retryAfterSeconds: 60,
    })

    const [url, init] = fetch.mock.calls[0]!
    expect(String(url)).toBe('https://client-test.shopwis.cn/api/v1/company/user/send/sms/code')
    expect(init?.headers).toEqual({ 'content-type': 'application/json' })
    expect(init?.body).toBe(JSON.stringify({ mobile: '18812345678' }))
  })

  it('maps the documented login response without runtime account fixtures', async () => {
    const fetch = vi.fn<(input: string | URL, init?: RequestInit) => Promise<Response>>(
      () => Promise.resolve(Response.json(loginResponse())),
    )
    const service = new DesktopAuthService(new DesktopAuthApi(client(fetch)))

    const session = await service.login({
      phone: '18812345678',
      verificationCode: '7788',
      remember: true,
    })

    expect(session).toMatchObject({
      provider: 'shopwis',
      accessToken: 'opaque-server-token',
      user: {
        id: '42',
        phone: '18812345678',
        displayName: '测试用户',
        company: 'Shopwis',
        avatarUrl: 'https://cdn.example.com/avatar.png',
      },
    })
    expect(session.user.coins).toBeUndefined()
    expect(fetch.mock.calls[0]?.[1]?.body).toBe(JSON.stringify({
      mobile: '18812345678',
      code: '7788',
    }))
  })

  it('preserves the server business message when login is rejected', async () => {
    const api = new DesktopAuthApi(client(() => Promise.resolve(
      Response.json({ code: 1001, msg: '验证码错误' }),
    )))

    await expect(api.login('18812345678', 'bad'))
      .rejects.toMatchObject({ kind: 'business', businessCode: 1001, message: '验证码错误' })
  })

  it('rejects success responses that omit a token', async () => {
    const response = loginResponse('')
    const api = new DesktopAuthApi(client(() => Promise.resolve(Response.json(response))))

    await expect(api.login('18812345678', '7788'))
      .rejects.toMatchObject({ kind: 'invalid-response' })
  })
})
