import { z } from 'zod'
import { describe, expect, it, vi } from 'vitest'
import { ShopwisApiError } from '../src/api/api-error.ts'
import { ShopwisHttpClient } from '../src/api/http-client.ts'

const okSchema = z.object({ code: z.literal(0), msg: z.string(), data: z.string() })

describe('desktop Shopwis HTTP client', () => {
  it('keeps login requests free of authorization headers', async () => {
    const fetch = vi.fn<(input: string | URL, init?: RequestInit) => Promise<Response>>(
      () => Promise.resolve(Response.json({ code: 0, msg: '', data: 'ok' })),
    )
    const client = new ShopwisHttpClient({
      baseUrl: 'https://client-test.shopwis.cn',
      fetch,
      tokenProvider: { getAccessToken: () => 'private-token' },
    })

    await client.postJson('/api/public', {}, okSchema, { authenticated: false })

    expect(fetch.mock.calls[0]?.[1]?.headers).toEqual({ 'content-type': 'application/json' })
  })

  it('resolves the latest token for each protected request', async () => {
    let token = 'first-token'
    const fetch = vi.fn((_input: string | URL, init?: RequestInit) => {
      expect(init?.headers).toMatchObject({ authorization: 'Bearer second-token' })
      return Promise.resolve(Response.json({ code: 0, msg: '', data: 'ok' }))
    })
    const client = new ShopwisHttpClient({
      baseUrl: 'https://client-test.shopwis.cn',
      fetch,
      tokenProvider: { getAccessToken: () => token },
    })
    token = 'second-token'

    await expect(client.postJson('/api/protected', {}, okSchema)).resolves.toMatchObject({ data: 'ok' })
  })

  it('reports a server business message before success-data validation', async () => {
    const client = new ShopwisHttpClient({
      baseUrl: 'https://client-test.shopwis.cn',
      fetch: () => Promise.resolve(Response.json({ code: 1001, msg: '验证码错误' })),
    })

    await expect(client.postJson('/api/public', {}, okSchema, { authenticated: false }))
      .rejects.toMatchObject({ kind: 'business', businessCode: 1001, message: '验证码错误' })
  })

  it('notifies the desktop session owner after a protected 401 response', async () => {
    const unauthorized = vi.fn()
    const client = new ShopwisHttpClient({
      baseUrl: 'https://client-test.shopwis.cn',
      fetch: () => Promise.resolve(Response.json({ code: 401, msg: '登录已失效' }, { status: 401 })),
      tokenProvider: { getAccessToken: () => 'expired-token' },
      onUnauthorized: unauthorized,
    })

    await expect(client.postJson('/api/protected', {}, okSchema)).rejects.toBeInstanceOf(ShopwisApiError)
    expect(unauthorized).toHaveBeenCalledOnce()
  })

  it('invalidates a protected session even when a 401 body is not JSON', async () => {
    const unauthorized = vi.fn()
    const client = new ShopwisHttpClient({
      baseUrl: 'https://client-test.shopwis.cn',
      fetch: () => Promise.resolve(new Response('', { status: 401 })),
      tokenProvider: { getAccessToken: () => 'expired-token' },
      onUnauthorized: unauthorized,
    })

    await expect(client.postJson('/api/protected', {}, okSchema))
      .rejects.toMatchObject({ kind: 'authentication', message: '登录状态已失效，请重新登录' })
    expect(unauthorized).toHaveBeenCalledOnce()
  })

  it('rejects paths that could escape the configured origin', async () => {
    const fetch = vi.fn<(input: string | URL, init?: RequestInit) => Promise<Response>>()
    const client = new ShopwisHttpClient({
      baseUrl: 'https://client-test.shopwis.cn',
      fetch,
      tokenProvider: { getAccessToken: () => 'private-token' },
    })

    await expect(client.postJson('/\\evil.example/api', {}, okSchema))
      .rejects.toThrow('Shopwis API path must remain on the configured origin')
    expect(fetch).not.toHaveBeenCalled()
  })
})
