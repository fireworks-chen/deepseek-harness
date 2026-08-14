import { spawn, type ChildProcessByStdio } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { Readable } from 'node:stream'

const READY_PATTERN = /^dsh web: (http:\/\/127\.0\.0\.1:\d+)\b/m
const STARTUP_TIMEOUT_MS = 60_000

export interface BackendLaunchOptions {
  electronExecutable: string
  binPath: string
  dshHome: string
  accessToken: string
  onUnexpectedExit(message: string): void
}

export class HarnessBackend {
  private child: ChildProcessByStdio<null, Readable, Readable> | undefined
  private currentUrl: string | undefined
  private stopping = false

  async start(options: BackendLaunchOptions): Promise<string> {
    if (this.child !== undefined && this.currentUrl !== undefined) return this.currentUrl
    if (this.child !== undefined) throw new Error('desktop backend is already starting')
    if (!existsSync(options.binPath)) {
      throw new Error(`desktop backend entry is missing: ${options.binPath}`)
    }
    this.stopping = false
    const child = spawn(options.electronExecutable, ['--expose-internals', options.binPath, 'web', '--host', '127.0.0.1', '--port', '0'], {
      cwd: homedir(),
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: '1',
        DSH_HOME: options.dshHome,
        DSH_DESKTOP_ACCESS_TOKEN: options.accessToken,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    this.child = child
    let output = ''
    let errors = ''
    let settled = false
    let ready = false
    const url = await new Promise<string>((resolve, reject) => {
      const fail = (error: Error): void => {
        if (settled) return
        settled = true
        clearTimeout(timeout)
        child.kill('SIGTERM')
        reject(error)
      }
      const timeout = setTimeout(() => {
        fail(new Error(`desktop backend did not become ready within ${String(STARTUP_TIMEOUT_MS / 1000)} seconds${errors === '' ? '' : `: ${errors}`}`))
      }, STARTUP_TIMEOUT_MS)
      child.once('error', fail)
      child.stderr.on('data', (chunk: Buffer) => {
        errors = `${errors}${chunk.toString('utf8')}`.slice(-8_000)
      })
      child.stdout.on('data', (chunk: Buffer) => {
        output = `${output}${chunk.toString('utf8')}`.slice(-8_000)
        const match = READY_PATTERN.exec(output)
        if (match?.[1] === undefined || settled) return
        settled = true
        ready = true
        clearTimeout(timeout)
        resolve(match[1])
      })
      child.once('exit', (code, signal) => {
        const reason = `desktop backend exited (${signal ?? String(code ?? 'unknown')})${errors === '' ? '' : `: ${errors}`}`
        if (!settled) fail(new Error(reason))
        else if (ready && !this.stopping) options.onUnexpectedExit(reason)
        if (this.child === child) {
          this.child = undefined
          this.currentUrl = undefined
        }
      })
    })
    this.currentUrl = url
    return url
  }

  async stop(): Promise<void> {
    const child = this.child
    if (child === undefined) return
    this.stopping = true
    await new Promise<void>((resolve) => {
      const force = setTimeout(() => {
        child.kill('SIGKILL')
      }, 5_000)
      child.once('exit', () => {
        clearTimeout(force)
        resolve()
      })
      child.kill('SIGTERM')
    })
    if (this.child === child) {
      this.child = undefined
      this.currentUrl = undefined
    }
  }
}

export function packagedBackendBin(resourcesPath: string): string {
  return join(resourcesPath, 'backend', 'lib', 'bin.js')
}
