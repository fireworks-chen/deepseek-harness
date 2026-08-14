export interface PermissionSet {
  models: string[]
  tools: string[]
  skills: string[]
  plugins: string[]
}

export interface PublicUser {
  id: string
  email: string
  displayName: string
  plan: string
  permissions: PermissionSet
}

export interface PublicBrand {
  productName: string
  displayName: string
  tagline: string
  logoDataUrl: string
  accentColor: string
  supportEmail: string
  authMode: 'mock'
  demoEmail: string
  demoPassword: string
}

export interface DesktopBootstrap {
  brand: PublicBrand
}

export interface LoginInput {
  email: string
  password: string
  remember: boolean
}

export type LoginResult =
  | { ok: true; user: PublicUser }
  | { ok: false; message: string }

export interface DesktopBridge {
  bootstrap(): Promise<DesktopBootstrap>
  login(input: LoginInput): Promise<LoginResult>
}
