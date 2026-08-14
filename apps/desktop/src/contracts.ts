export interface PermissionSet {
  models: string[]
  tools: string[]
  skills: string[]
  plugins: string[]
}

export interface PublicUser {
  id: string
  email: string
  phone: string
  displayName: string
  company: string
  avatarUrl?: string
  coins: number
  plan: string
  permissions: PermissionSet
}

export interface PublicBrand {
  productName: string
  displayName: string
  tagline: string
  logoDataUrl: string
  defaultAvatarDataUrl: string
  accentColor: string
  supportEmail: string
  authMode: 'mock'
  clientBaseUrl: string
  userAgreementUrl: string
  privacyPolicyUrl: string
}

export interface DesktopBootstrap {
  brand: PublicBrand
}

export interface DesktopAccountSnapshot {
  user: PublicUser
  defaultAvatarDataUrl: string
}

export interface LoginInput {
  phone: string
  verificationCode: string
  remember: boolean
}

export type VerificationCodeResult =
  | { ok: true; retryAfterSeconds: number }
  | { ok: false; message: string }

export type LoginResult =
  | { ok: true; user: PublicUser }
  | { ok: false; message: string }

export interface DesktopBridge {
  bootstrap(): Promise<DesktopBootstrap>
  requestVerificationCode(phone: string): Promise<VerificationCodeResult>
  login(input: LoginInput): Promise<LoginResult>
  account(): Promise<DesktopAccountSnapshot | undefined>
  logout(): Promise<void>
}
