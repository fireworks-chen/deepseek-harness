import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  app, BrowserWindow, dialog, ipcMain, Menu, safeStorage, shell,
  type MenuItemConstructorOptions,
} from 'electron'
import { MockAuthProvider, type AuthSession } from './auth.ts'
import { HarnessBackend, packagedBackendBin } from './backend.ts'
import { loadDesktopConfig, publicBrand, resolveConfiguredPath } from './config.ts'
import type { DesktopBootstrap, LoginInput, LoginResult } from './contracts.ts'

const packageRoot = fileURLToPath(new URL('..', import.meta.url))
const configPath = app.isPackaged
  ? join(process.resourcesPath, 'desktop.config.json')
  : join(packageRoot, 'desktop.config.json')
const config = loadDesktopConfig(configPath)
const brand = publicBrand(config, configPath)
const auth = new MockAuthProvider(config.auth.mock)
const backend = new HarnessBackend()
const sessionPath = (): string => join(app.getPath('userData'), 'auth-session.bin')

let mainWindow: BrowserWindow | undefined
let session: AuthSession | undefined
let quitting = false
let workspaceOrigin: string | undefined

function rendererIndex(): string {
  return join(packageRoot, 'renderer-dist', 'index.html')
}

function backendBin(): string {
  return app.isPackaged
    ? packagedBackendBin(process.resourcesPath)
    : join(packageRoot, '..', 'cli', 'lib', 'bin.js')
}

function createWindow(): BrowserWindow {
  const icon = resolveConfiguredPath(configPath, config.appIcon)
  const window = new BrowserWindow({
    width: 1180,
    height: 780,
    minWidth: 900,
    minHeight: 620,
    show: false,
    title: config.productName,
    backgroundColor: '#f5f6f7',
    ...(existsSync(icon) ? { icon } : {}),
    webPreferences: {
      preload: join(packageRoot, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      devTools: !app.isPackaged,
    },
  })
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url)
    return { action: 'deny' }
  })
  window.webContents.on('will-navigate', (event, url) => {
    const allowedFile = url.startsWith('file:')
    const allowedWorkspace = workspaceOrigin !== undefined && new URL(url).origin === workspaceOrigin
    if (!allowedFile && !allowedWorkspace) event.preventDefault()
  })
  window.webContents.on('page-title-updated', (event) => {
    event.preventDefault()
    window.setTitle(config.productName)
  })
  window.once('ready-to-show', () => { window.show() })
  window.on('closed', () => {
    if (mainWindow === window) mainWindow = undefined
  })
  return window
}

async function showLogin(): Promise<void> {
  if (mainWindow === undefined) mainWindow = createWindow()
  await mainWindow.loadFile(rendererIndex())
}

async function showWorkspace(activeSession: AuthSession): Promise<void> {
  if (mainWindow === undefined) mainWindow = createWindow()
  const dshHome = join(app.getPath('userData'), 'harness')
  mkdirSync(dshHome, { recursive: true })
  const url = await backend.start({
    electronExecutable: process.execPath,
    binPath: backendBin(),
    dshHome,
    accessToken: activeSession.accessToken,
    onUnexpectedExit: (message) => {
      dialog.showErrorBox(`${config.productName} 后端已停止`, message)
      session = undefined
      void showLogin()
    },
  })
  workspaceOrigin = new URL(url).origin
  await mainWindow.loadURL(url)
}

function persistSession(activeSession: AuthSession | undefined): void {
  const path = sessionPath()
  if (activeSession === undefined) {
    rmSync(path, { force: true })
    return
  }
  if (!safeStorage.isEncryptionAvailable()) return
  mkdirSync(app.getPath('userData'), { recursive: true })
  writeFileSync(path, safeStorage.encryptString(JSON.stringify(activeSession)), { mode: 0o600 })
}

function restoreSession(): AuthSession | undefined {
  const path = sessionPath()
  if (!existsSync(path) || !safeStorage.isEncryptionAvailable()) return undefined
  try {
    const restored = JSON.parse(safeStorage.decryptString(readFileSync(path))) as AuthSession
    if (restored.expiresAt <= Date.now() || !restored.accessToken.startsWith('mock.')) {
      persistSession(undefined)
      return undefined
    }
    return restored
  } catch {
    persistSession(undefined)
    return undefined
  }
}

function installIpc(): void {
  ipcMain.handle('desktop:bootstrap', (): DesktopBootstrap => ({ brand }))
  ipcMain.handle('desktop:login', async (_event, input: unknown): Promise<LoginResult> => {
    if (typeof input !== 'object' || input === null) {
      return { ok: false, message: '登录参数无效' }
    }
    const candidate = input as Record<string, unknown>
    if (typeof candidate.email !== 'string' || typeof candidate.password !== 'string' || typeof candidate.remember !== 'boolean') {
      return { ok: false, message: '登录参数无效' }
    }
    const loginInput: LoginInput = {
      email: candidate.email,
      password: candidate.password,
      remember: candidate.remember,
    }
    try {
      const authenticated = await auth.login(loginInput)
      session = authenticated
      if (loginInput.remember) persistSession(authenticated)
      else persistSession(undefined)
      await showWorkspace(authenticated)
      installMenu()
      return { ok: true, user: authenticated.user }
    } catch (error) {
      session = undefined
      persistSession(undefined)
      await backend.stop()
      return { ok: false, message: error instanceof Error ? error.message : String(error) }
    }
  })
}

async function signOut(): Promise<void> {
  session = undefined
  workspaceOrigin = undefined
  persistSession(undefined)
  await backend.stop()
  await showLogin()
  installMenu()
}

function installMenu(): void {
  const appItems: MenuItemConstructorOptions[] = [
    { role: 'about' },
    { type: 'separator' },
    ...(session === undefined ? [] : [{ label: '退出登录', click: () => { void signOut() } }]),
    { type: 'separator' },
    { role: 'quit' },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: config.productName, submenu: appItems },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' },
  ]))
}

async function start(): Promise<void> {
  app.setName(config.productName)
  installIpc()
  installMenu()
  session = restoreSession()
  if (session === undefined) await showLogin()
  else {
    try {
      await showWorkspace(session)
      installMenu()
    } catch (error) {
      session = undefined
      workspaceOrigin = undefined
      persistSession(undefined)
      await backend.stop()
      await showLogin()
      dialog.showErrorBox(`${config.productName} 启动失败`, error instanceof Error ? error.message : String(error))
    }
  }
}

if (!app.requestSingleInstanceLock()) app.quit()
else {
  app.on('second-instance', () => {
    if (mainWindow === undefined) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
  })
  app.on('activate', () => {
    if (mainWindow === undefined) void (session === undefined ? showLogin() : showWorkspace(session))
  })
  app.on('before-quit', (event) => {
    if (quitting) return
    event.preventDefault()
    quitting = true
    void backend.stop().finally(() => { app.quit() })
  })
  void app.whenReady().then(start).catch((error: unknown) => {
    dialog.showErrorBox(`${config.productName} 启动失败`, error instanceof Error ? error.message : String(error))
    app.quit()
  })
}
