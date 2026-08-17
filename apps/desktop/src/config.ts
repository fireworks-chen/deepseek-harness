import { readFileSync } from 'node:fs'
import { dirname, extname, isAbsolute, join } from 'node:path'
import type { PublicBrand } from './contracts.ts'

/** Validated Electron product and Shopwis deployment configuration. */
export interface DesktopConfig {
  appId: string
  productName: string
  displayName: string
  tagline: string
  logo: string
  defaultAvatar: string
  appIcon: string
  accentColor: string
  supportEmail: string
  clientBaseUrl: string
  shopwis: {
    authBaseUrl: string
    requestTimeoutMs: number
  }
}

function requiredString(record: Record<string, unknown>, key: string, owner: string): string {
  const value = record[key]
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`desktop config: ${owner}.${key} must be a non-empty string`)
  }
  return value
}

function positiveInteger(record: Record<string, unknown>, key: string, owner: string): number {
  const value = record[key]
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`desktop config: ${owner}.${key} must be a positive integer`)
  }
  return value
}

function object(value: unknown, owner: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`desktop config: ${owner} must be an object`)
  }
  return value as Record<string, unknown>
}

function httpsOrigin(value: string, owner: string): string {
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
    throw new Error(`desktop config: ${owner} must be an HTTPS origin`)
  }
}

function configuredOrigin(
  environment: Readonly<Record<string, string | undefined>>,
  environmentKey: string,
  fallback: string,
  fallbackOwner: string,
): string {
  const override = environment[environmentKey]?.trim()
  return httpsOrigin(override === undefined || override === '' ? fallback : override,
    override === undefined || override === '' ? fallbackOwner : environmentKey)
}

/**
 * Load and validate the desktop product configuration.
 * @param configPath - desktop.config.json path.
 * @param environment - deployment overrides for public, authentication, and agent origins.
 * @returns validated desktop configuration.
 */
export function loadDesktopConfig(
  configPath: string,
  environment: Readonly<Record<string, string | undefined>> = process.env,
): DesktopConfig {
  const root = object(JSON.parse(readFileSync(configPath, 'utf8')), 'root')
  const shopwis = object(root.shopwis, 'shopwis')
  const accentColor = requiredString(root, 'accentColor', 'root')
  if (!/^#[0-9a-f]{6}$/i.test(accentColor)) {
    throw new Error('desktop config: accentColor must be a six-digit hex color')
  }
  return {
    appId: requiredString(root, 'appId', 'root'),
    productName: requiredString(root, 'productName', 'root'),
    displayName: requiredString(root, 'displayName', 'root'),
    tagline: requiredString(root, 'tagline', 'root'),
    logo: requiredString(root, 'logo', 'root'),
    defaultAvatar: requiredString(root, 'defaultAvatar', 'root'),
    appIcon: requiredString(root, 'appIcon', 'root'),
    accentColor,
    supportEmail: requiredString(root, 'supportEmail', 'root'),
    clientBaseUrl: configuredOrigin(
      environment,
      'SHOPWIS_CLIENT_BASE_URL',
      requiredString(root, 'clientBaseUrl', 'root'),
      'root.clientBaseUrl',
    ),
    shopwis: {
      authBaseUrl: configuredOrigin(
        environment,
        'SHOPWIS_AUTH_BASE_URL',
        requiredString(shopwis, 'authBaseUrl', 'shopwis'),
        'shopwis.authBaseUrl',
      ),
      requestTimeoutMs: positiveInteger(shopwis, 'requestTimeoutMs', 'shopwis'),
    },
  }
}

function mimeType(path: string): string {
  switch (extname(path).toLowerCase()) {
    case '.svg': return 'image/svg+xml'
    case '.png': return 'image/png'
    case '.jpg':
    case '.jpeg': return 'image/jpeg'
    case '.webp': return 'image/webp'
    default: throw new Error(`desktop config: unsupported logo format ${extname(path)}`)
  }
}

/** Resolve a configured asset relative to desktop.config.json. */
export function resolveConfiguredPath(configPath: string, configuredPath: string): string {
  return isAbsolute(configuredPath) ? configuredPath : join(dirname(configPath), configuredPath)
}

/** Build the renderer-safe product configuration without private API origins. */
export function publicBrand(config: DesktopConfig, configPath: string): PublicBrand {
  const logoPath = resolveConfiguredPath(configPath, config.logo)
  const defaultAvatarPath = resolveConfiguredPath(configPath, config.defaultAvatar)
  const logoDataUrl = `data:${mimeType(logoPath)};base64,${readFileSync(logoPath).toString('base64')}`
  const defaultAvatarDataUrl = `data:${mimeType(defaultAvatarPath)};base64,${readFileSync(defaultAvatarPath).toString('base64')}`
  return {
    productName: config.productName,
    displayName: config.displayName,
    tagline: config.tagline,
    logoDataUrl,
    defaultAvatarDataUrl,
    accentColor: config.accentColor,
    supportEmail: config.supportEmail,
    authMode: 'shopwis',
    clientBaseUrl: config.clientBaseUrl,
    userAgreementUrl: `${config.clientBaseUrl}/user-agreement`,
    privacyPolicyUrl: `${config.clientBaseUrl}/privacy-policy`,
  }
}
