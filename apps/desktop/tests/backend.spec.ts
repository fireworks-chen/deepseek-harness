import { describe, expect, it } from 'vitest'
import { backendArgv } from '../src/backend.ts'

describe('desktop backend launch arguments', () => {
  it('applies the desktop overlay before forwarding web arguments', () => {
    expect(backendArgv({
      binPath: '/app/backend/lib/bin.js',
      patchPath: '/app/desktop.cordis.patch.yml',
    })).toEqual([
      '--expose-internals',
      '/app/backend/lib/bin.js',
      'web',
      '--patch',
      '/app/desktop.cordis.patch.yml',
      '--host',
      '127.0.0.1',
      '--port',
      '0',
    ])
  })
})
