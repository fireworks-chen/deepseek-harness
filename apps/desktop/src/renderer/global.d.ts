import type { DesktopBridge } from '../contracts.ts'

declare global {
  interface Window {
    desktop: DesktopBridge
  }
}

export {}
