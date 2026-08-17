import { existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  app, BrowserWindow, dialog, ipcMain, Menu, net, shell,
  type MenuItemConstructorOptions,
} from 'electron'
import { createDesktopShopwisClient } from './api/shopwis-client.ts'
import { DesktopAuthApi } from './auth/auth-api.ts'
import { DesktopAuthService } from './auth/auth-service.ts'
import { DesktopSessionManager, type AuthSession } from './auth/session-manager.ts'
import { EncryptedSessionStorage } from './auth/session-storage.ts'
import { HarnessBackend, packagedBackendBin } from './backend.ts'
import { loadDesktopConfig, publicBrand, resolveConfiguredPath } from './config.ts'
import { installAccountIpc } from './ipc/account-handlers.ts'
import { installAuthIpc } from './ipc/auth-handlers.ts'

const packageRoot = fileURLToPath(new URL('..', import.meta.url))
const configPath = app.isPackaged
  ? join(process.resourcesPath, 'desktop.config.json')
  : join(packageRoot, 'desktop.config.json')
const patchPath = app.isPackaged
  ? join(process.resourcesPath, 'desktop.cordis.patch.yml')
  : join(packageRoot, 'desktop.cordis.patch.yml')
const config = loadDesktopConfig(configPath)
const brand = publicBrand(config, configPath)
const backend = new HarnessBackend()
const sessionPath = (): string => join(app.getPath('userData'), 'auth-session.bin')
const sessions = new DesktopSessionManager(new EncryptedSessionStorage(sessionPath))

let mainWindow: BrowserWindow | undefined
let quitting = false
let workspaceOrigin: string | undefined
let expiringSession: Promise<void> | undefined
let expiryTimer: ReturnType<typeof setTimeout> | undefined

async function expireSession(): Promise<void> {
  expiringSession ??= signOut().finally(() => { expiringSession = undefined })
  await expiringSession
}

const shopwisClient = createDesktopShopwisClient({
  baseUrl: config.shopwis.authBaseUrl,
  timeoutMs: config.shopwis.requestTimeoutMs,
  fetch: (input, init) => net.fetch(String(input), init),
  sessions,
  onUnauthorized: expireSession,
})
const authentication = new DesktopAuthService(new DesktopAuthApi(shopwisClient))

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
    patchPath,
    dshHome,
    accessToken: activeSession.accessToken,
    onUnexpectedExit: (message) => {
      dialog.showErrorBox(`${config.productName} 后端已停止`, message)
      clearExpiryTimer()
      sessions.clear()
      workspaceOrigin = undefined
      void showLogin().then(installMenu)
    },
  })
  workspaceOrigin = new URL(url).origin
  await mainWindow.loadURL(url)
}

function clearExpiryTimer(): void {
  if (expiryTimer !== undefined) clearTimeout(expiryTimer)
  expiryTimer = undefined
}

function scheduleExpiry(activeSession: AuthSession): void {
  clearExpiryTimer()
  if (activeSession.expiresAt === undefined) return
  const remaining = activeSession.expiresAt - Date.now()
  if (remaining <= 0) {
    void signOut()
    return
  }
  const maximumDelay = 2_147_483_647
  expiryTimer = setTimeout(() => {
    if (remaining > maximumDelay) scheduleExpiry(activeSession)
    else void expireSession()
  }, Math.min(remaining, maximumDelay))
}

async function activateWorkspace(activeSession: AuthSession): Promise<void> {
  await showWorkspace(activeSession)
  scheduleExpiry(activeSession)
}

function installIpc(): void {
  installAccountIpc({ ipcMain, brand, sessions, logout: signOut })
  installAuthIpc({
    ipcMain,
    auth: authentication,
    sessions,
    showWorkspace: activateWorkspace,
    stopBackend: () => backend.stop(),
    refreshMenu: installMenu,
  })
}

async function signOut(): Promise<void> {
  clearExpiryTimer()
  sessions.clear()
  workspaceOrigin = undefined
  await backend.stop()
  await showLogin()
  installMenu()
}

function installMenu(): void {
  const appItems: MenuItemConstructorOptions[] = [
    { role: 'about' },
    { type: 'separator' },
    ...(sessions.current() === undefined ? [] : [{ label: '退出登录', click: () => { void signOut() } }]),
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
  const restored = sessions.restore()
  if (restored === undefined) await showLogin()
  else {
    try {
      await activateWorkspace(restored)
      installMenu()
    } catch (error) {
      sessions.clear()
      workspaceOrigin = undefined
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
    if (mainWindow === undefined) {
      const active = sessions.current()
      void (active === undefined ? showLogin() : activateWorkspace(active))
    }
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
