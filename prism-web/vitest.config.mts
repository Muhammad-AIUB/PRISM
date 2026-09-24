import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

/**
 * Unit tests for prism-web. jsdom for the components; the server-only modules
 * (src/lib/api.ts, src/middleware.ts) mock the Next APIs they call, so no Next
 * runtime is started. `@/` mirrors the `paths` entry in tsconfig.json.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['./src/test/setup.ts'],
    restoreMocks: true,
    unstubEnvs: true,
    unstubGlobals: true,
  },
});
