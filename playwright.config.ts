import { existsSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

// Locally a preinstalled Chromium may be used; in CI Playwright installs its own.
const localChromium = '/opt/pw-browsers/chromium';
const executablePath = !process.env.CI && existsSync(localChromium) ? localChromium : undefined;

export default defineConfig({
  testDir: 'tests/e2e',
  forbidOnly: !!process.env.CI,
  use: {
    baseURL: 'http://localhost:4173',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], launchOptions: { executablePath } },
    },
    // The file and autosave flows must also work in Firefox and WebKit (CI only).
    ...(process.env.CI
      ? [
          {
            name: 'firefox',
            use: { ...devices['Desktop Firefox'] },
            testMatch: /files\.spec\.ts/,
          },
          { name: 'webkit', use: { ...devices['Desktop Safari'] }, testMatch: /files\.spec\.ts/ },
        ]
      : []),
  ],
  webServer: {
    command: 'npm run build && npm run preview -- --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
