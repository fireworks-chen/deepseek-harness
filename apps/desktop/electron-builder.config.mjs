import { readFileSync } from 'node:fs'
import { cp, rm } from 'node:fs/promises'
import { join } from 'node:path'

const directory = import.meta.dirname
const brand = JSON.parse(readFileSync(join(directory, 'desktop.config.json'), 'utf8'))

export default {
  appId: brand.appId,
  productName: brand.productName,
  electronDist: join(directory, 'node_modules', 'electron', 'dist'),
  asar: true,
  npmRebuild: false,
  directories: {
    output: 'release',
  },
  files: [
    'lib/**/*',
    'renderer-dist/**/*',
    'preload.cjs',
    'package.json',
  ],
  extraResources: [
    { from: 'desktop.config.json', to: 'desktop.config.json' },
    { from: 'assets', to: 'assets' },
  ],
  afterPack: async (context) => {
    const resourcesDirectory = context.electronPlatformName === 'darwin'
      ? join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`, 'Contents', 'Resources')
      : join(context.appOutDir, 'resources')
    const backendTarget = join(resourcesDirectory, 'backend')
    await rm(backendTarget, { recursive: true, force: true })
    await cp(join(directory, 'dist', 'backend'), backendTarget, {
      recursive: true,
      dereference: false,
      verbatimSymlinks: true,
    })
  },
  mac: {
    category: 'public.app-category.developer-tools',
    icon: brand.appIcon,
    hardenedRuntime: true,
    gatekeeperAssess: false,
    target: ['dir', 'dmg'],
  },
  dmg: {
    title: `${brand.productName} \${version}`,
    artifactName: `${brand.productName}-\${version}-\${arch}.\${ext}`,
  },
}
