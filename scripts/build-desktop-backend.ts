/** Stage a self-contained production dependency closure for the Electron app. */

import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { cp, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve, sep } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const target = join(root, 'apps', 'desktop', 'dist', 'backend')
const workspaceStatePath = join(root, 'node_modules', '.pnpm-workspace-state-v1.json')

async function run(command: string, args: string[]): Promise<void> {
  await new Promise<void>((resolvePromise, reject) => {
    const child = spawn(command, args, { cwd: root, stdio: 'inherit' })
    child.once('error', reject)
    child.once('exit', (code, signal) => {
      if (code === 0) resolvePromise()
      else reject(new Error(`desktop backend staging failed (${signal ?? String(code)})`))
    })
  })
}

async function capture(command: string, args: string[]): Promise<string> {
  return await new Promise<string>((resolvePromise, reject) => {
    const child = spawn(command, args, { cwd: root, stdio: ['ignore', 'pipe', 'inherit'] })
    let output = ''
    child.stdout.on('data', (chunk: Buffer) => { output += chunk.toString('utf8') })
    child.once('error', reject)
    child.once('exit', (code, signal) => {
      if (code === 0) resolvePromise(output)
      else reject(new Error(`command failed (${signal ?? String(code)}): ${command} ${args.join(' ')}`))
    })
  })
}

async function deployProductionBackend(staging: string): Promise<void> {
  // pnpm deploy records its --prod selection in the source workspace state.
  // Restore that generated file so a later pnpm run does not prune dev tools.
  const previousWorkspaceState = existsSync(workspaceStatePath)
    ? await readFile(workspaceStatePath)
    : undefined
  try {
    await run(process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm', [
      '--filter', '@deepseek-ai/dsh',
      'deploy', '--legacy', '--prod',
      '--config.node-linker=isolated',
      '--config.auto-install-peers=false',
      '--config.link-workspace-packages=true',
      staging,
    ])
  } finally {
    if (previousWorkspaceState === undefined) await rm(workspaceStatePath, { force: true })
    else await writeFile(workspaceStatePath, previousWorkspaceState)
  }
}

interface PackageManifest {
  name?: string
  dependencies?: Record<string, string>
  optionalDependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
}

interface WorkspaceProject {
  name: string
  path: string
}

async function readManifest(directory: string): Promise<PackageManifest> {
  return JSON.parse(await readFile(join(directory, 'package.json'), 'utf8')) as PackageManifest
}

async function ensureWorkspaceDependencyClosure(nodeModules: string): Promise<void> {
  const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
  const projects = JSON.parse(await capture(pnpm, ['-r', 'list', '--depth', '-1', '--json'])) as WorkspaceProject[]
  const workspaceByName = new Map(projects.map(project => [project.name, project.path]))
  const pending = ['@deepseek-ai/dsh']
  const visited = new Set<string>()

  while (pending.length > 0) {
    const name = pending.pop()
    if (name === undefined || visited.has(name)) continue
    visited.add(name)
    const source = workspaceByName.get(name)
    if (source === undefined) continue
    const manifest = await readManifest(source)
    const dependencies = {
      ...manifest.dependencies,
      ...manifest.optionalDependencies,
      ...manifest.peerDependencies,
    }
    for (const dependency of Object.keys(dependencies)) {
      const dependencySource = workspaceByName.get(dependency)
      if (dependencySource === undefined) continue
      const dependencyTarget = join(nodeModules, ...dependency.split('/'))
      if (!existsSync(dependencyTarget)) {
        await mkdir(join(dependencyTarget, '..'), { recursive: true })
        const sourceNodeModules = join(dependencySource, 'node_modules')
        await cp(dependencySource, dependencyTarget, {
          recursive: true,
          dereference: true,
          filter: path => path !== sourceNodeModules && !path.startsWith(sourceNodeModules + sep),
        })
      }
      pending.push(dependency)
    }
  }
}

async function promoteHoistedDependencies(nodeModules: string): Promise<void> {
  const hoisted = join(nodeModules, '.pnpm', 'node_modules')
  if (!existsSync(hoisted)) return

  const promote = async (source: string, destination: string): Promise<void> => {
    if (existsSync(destination)) return
    await mkdir(dirname(destination), { recursive: true })
    const target = relative(dirname(destination), source)
    await symlink(target, destination, process.platform === 'win32' ? 'junction' : 'dir')
  }

  for (const entry of await readdir(hoisted, { withFileTypes: true })) {
    const source = join(hoisted, entry.name)
    if (entry.name.startsWith('@') && entry.isDirectory()) {
      for (const scopedEntry of await readdir(source)) {
        await promote(join(source, scopedEntry), join(nodeModules, entry.name, scopedEntry))
      }
    } else {
      await promote(source, join(nodeModules, entry.name))
    }
  }
}

async function pruneNativePrebuilds(nodeModules: string): Promise<void> {
  const prebuilds = join(nodeModules, 'node-pty', 'prebuilds')
  if (!existsSync(prebuilds)) return
  const current = `${process.platform}-${process.arch}`
  for (const entry of await readdir(prebuilds, { withFileTypes: true })) {
    if (entry.isDirectory() && entry.name !== current) {
      await rm(join(prebuilds, entry.name), { recursive: true, force: true })
    }
  }
}

async function main(): Promise<void> {
  if (target === root || root.startsWith(`${target}${sep}`)) {
    throw new Error(`refusing to replace unsafe desktop backend target ${target}`)
  }
  const staging = await mkdtemp(join(tmpdir(), 'dsh-desktop-backend-'))
  try {
    await deployProductionBackend(staging)
    const nodeModules = join(staging, 'node_modules')
    if (existsSync(nodeModules)) {
      await ensureWorkspaceDependencyClosure(nodeModules)
      await promoteHoistedDependencies(nodeModules)
      await pruneNativePrebuilds(nodeModules)
    }
    const bin = join(staging, 'lib', 'bin.js')
    const frontend = join(staging, 'node_modules', '@deepseek-ai', 'dsh-web-frontend', 'dist', 'index.html')
    if (!existsSync(bin)) throw new Error(`desktop backend entry missing after deploy: ${bin}`)
    if (!existsSync(frontend)) throw new Error(`desktop frontend missing after deploy: ${frontend}`)
    await rm(target, { recursive: true, force: true })
    await mkdir(join(target, '..'), { recursive: true })
    await cp(staging, target, { recursive: true, dereference: false, verbatimSymlinks: true })
    console.log(`desktop backend staged at ${target}`)
  } finally {
    await rm(staging, { recursive: true, force: true })
  }
}

void main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
