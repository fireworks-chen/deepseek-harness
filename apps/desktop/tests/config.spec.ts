import { describe, expect, it } from 'vitest'
import { join } from 'node:path'
import { loadDesktopConfig, publicBrand } from '../src/config.ts'

const configPath = join(import.meta.dirname, '..', 'desktop.config.json')

describe('desktop deployment configuration', () => {
  it('keeps the public website and authentication origins independently available', () => {
    const config = loadDesktopConfig(configPath, {})
    const brand = publicBrand(config, configPath)

    expect(config.clientBaseUrl).toBe('https://client-test.shopwis.cn')
    expect(config.shopwis.authBaseUrl).toBe('https://client-test.shopwis.cn')
    expect(brand.authMode).toBe('shopwis')
    expect(brand.userAgreementUrl).toBe('https://client-test.shopwis.cn/user-agreement')
    expect(brand.privacyPolicyUrl).toBe('https://client-test.shopwis.cn/privacy-policy')
  })

  it('normalizes independent runtime environment overrides', () => {
    const config = loadDesktopConfig(configPath, {
      SHOPWIS_CLIENT_BASE_URL: 'https://client.shopwis.cn/',
      SHOPWIS_AUTH_BASE_URL: 'https://auth.shopwis.cn/',
    })

    expect(config.clientBaseUrl).toBe('https://client.shopwis.cn')
    expect(config.shopwis.authBaseUrl).toBe('https://auth.shopwis.cn')
  })

  it('rejects a non-HTTPS authentication origin', () => {
    expect(() => loadDesktopConfig(configPath, {
      SHOPWIS_AUTH_BASE_URL: 'http://auth.shopwis.cn',
    })).toThrow('SHOPWIS_AUTH_BASE_URL must be an HTTPS origin')
  })
})
