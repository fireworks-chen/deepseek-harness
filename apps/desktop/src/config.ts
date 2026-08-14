import { readFileSync } from 'node:fs'
import { dirname, extname, isAbsolute, join } from 'node:path'
import type { PermissionSet, PublicBrand } from './contracts.ts'

export interface MockAuthConfig {
  email: string
  displayName: string
  company: string
  avatarUrl?: string
  coins: number
  plan: string
  permissions: PermissionSet
}

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
  auth: {
    provider: 'mock'
    endpoint: string
    mock: MockAuthConfig
  }
}

function requiredString(record: Record<string, unknown>, key: string, owner: string): string {
  const value = record[key]
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`desktop config: ${owner}.${key} must be a non-empty string`)
  }
  return value
}

function stringArray(record: Record<string, unknown>, key: string): string[] {
  const value = record[key]
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string')) {
    throw new Error(`desktop config: auth.mock.permissions.${key} must be a string array`)
  }
  const items: unknown[] = value
  return items.map(item => item as string)
}

function optionalString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key]
  if (value === undefined || value === '') return undefined
  if (typeof value !== 'string') {
    throw new Error(`desktop config: auth.mock.${key} must be a string`)
  }
  return value
}

function nonNegativeInteger(record: Record<string, unknown>, key: string, owner: string): number {
  const value = record[key]
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`desktop config: ${owner}.${key} must be a non-negative integer`)
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
    ) {
      throw new Error('not an HTTPS origin')
    }
    return parsed.origin
  } catch {
    throw new Error(`desktop config: ${owner} must be an HTTPS origin`)
  }
}

export function loadDesktopConfig(
  configPath: string,
  environment: Readonly<Record<string, string | undefined>> = process.env,
): DesktopConfig {
  const root = object(JSON.parse(readFileSync(configPath, 'utf8')), 'root')
  const auth = object(root.auth, 'auth')
  if (auth.provider !== 'mock') {
    throw new Error(`desktop config: unsupported auth provider ${JSON.stringify(auth.provider)}`)
  }
  const mock = object(auth.mock, 'auth.mock')
  const permissions = object(mock.permissions, 'auth.mock.permissions')
  const avatarUrl = optionalString(mock, 'avatarUrl')
  const accentColor = requiredString(root, 'accentColor', 'root')
  if (!/^#[0-9a-f]{6}$/i.test(accentColor)) {
    throw new Error('desktop config: accentColor must be a six-digit hex color')
  }
  const configuredClientBaseUrl = environment.SHOPWIS_CLIENT_BASE_URL?.trim()
    || requiredString(root, 'clientBaseUrl', 'root')
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
    clientBaseUrl: httpsOrigin(
      configuredClientBaseUrl,
      environment.SHOPWIS_CLIENT_BASE_URL?.trim() === undefined
        ? 'root.clientBaseUrl'
        : 'SHOPWIS_CLIENT_BASE_URL',
    ),
    auth: {
      provider: 'mock',
      endpoint: typeof auth.endpoint === 'string' ? auth.endpoint : '',
      mock: {
        email: requiredString(mock, 'email', 'auth.mock'),
        displayName: requiredString(mock, 'displayName', 'auth.mock'),
        company: requiredString(mock, 'company', 'auth.mock'),
        ...avatarUrl === undefined ? {} : { avatarUrl },
        coins: nonNegativeInteger(mock, 'coins', 'auth.mock'),
        plan: requiredString(mock, 'plan', 'auth.mock'),
        permissions: {
          models: stringArray(permissions, 'models'),
          tools: stringArray(permissions, 'tools'),
          skills: stringArray(permissions, 'skills'),
          plugins: stringArray(permissions, 'plugins'),
        },
      },
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

export function resolveConfiguredPath(configPath: string, configuredPath: string): string {
  return isAbsolute(configuredPath) ? configuredPath : join(dirname(configPath), configuredPath)
}

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
    authMode: 'mock',
    clientBaseUrl: config.clientBaseUrl,
    userAgreementUrl: `${config.clientBaseUrl}/user-agreement`,
    privacyPolicyUrl: `${config.clientBaseUrl}/privacy-policy`,
  }
}
