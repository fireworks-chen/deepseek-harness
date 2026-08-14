import { describe, expect, it } from 'vitest'
import { join } from 'node:path'
import { loadDesktopConfig, publicBrand } from '../src/config.ts'

const configPath = join(import.meta.dirname, '..', 'desktop.config.json')

describe('desktop client website configuration', () => {
  it('derives the agreement links from the configured test origin', () => {
    const config = loadDesktopConfig(configPath, {})
    const brand = publicBrand(config, configPath)

    expect(config.clientBaseUrl).toBe('https://client-test.shopwis.cn')
    expect(brand.userAgreementUrl).toBe('https://client-test.shopwis.cn/user-agreement')
    expect(brand.privacyPolicyUrl).toBe('https://client-test.shopwis.cn/privacy-policy')
  })

  it('normalizes the runtime environment override', () => {
    const config = loadDesktopConfig(configPath, {
      SHOPWIS_CLIENT_BASE_URL: 'https://client.shopwis.cn/',
    })
    const brand = publicBrand(config, configPath)

    expect(config.clientBaseUrl).toBe('https://client.shopwis.cn')
    expect(brand.userAgreementUrl).toBe('https://client.shopwis.cn/user-agreement')
    expect(brand.privacyPolicyUrl).toBe('https://client.shopwis.cn/privacy-policy')
  })

  it('rejects a non-HTTPS client origin', () => {
    expect(() => loadDesktopConfig(configPath, {
      SHOPWIS_CLIENT_BASE_URL: 'http://client.shopwis.cn',
    })).toThrow('SHOPWIS_CLIENT_BASE_URL must be an HTTPS origin')
  })
})
