import { nxCopyAssetsPlugin } from '@nx/vite/plugins/nx-copy-assets.plugin'
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin'
import { defineConfig } from 'vitest/config'

export default defineConfig(() => ({
  root: __dirname,
  cacheDir: '../../node_modules/.vite/apps/aitoearn-ai',
  plugins: [nxViteTsPaths(), nxCopyAssetsPlugin(['*.md'])],
  test: {
    name: 'aitoearn-ai',
    watch: false,
    globals: true,
    environment: 'node',
    include: ['{src,tests}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    exclude: [
      'src/core/agent/services/agent-runtime.service.spec.ts',
      'src/core/ai/chat/chat.service.spec.ts',
      'src/core/draft-generation/draft-generation.service.spec.ts',
    ],
    reporters: ['default'],
    setupFiles: ['./test/setup.ts'],
    coverage: {
      reportsDirectory: '../../coverage/apps/aitoearn-ai',
      provider: 'v8' as const,
    },
  },
}))
