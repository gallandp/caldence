import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify('0.0.0-test') },
  resolve: {
    alias: {
      'virtual:pwa-register': fileURLToPath(
        new URL('./tests/stubs/pwa-register.ts', import.meta.url),
      ),
    },
  },
  test: { include: ['tests/unit/**/*.test.ts'] },
});
