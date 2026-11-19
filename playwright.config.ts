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
      testIgnore: /update-notice\.spec\.ts|performance\.spec\.ts/,
    },
    // Times views with the CPU throttled, so it runs alone after the other Chromium tests (#315).
    {
      name: 'chromium-perf',
      use: { ...devices['Desktop Chrome'], launchOptions: { executablePath } },
      testMatch: /performance\.spec\.ts/,
      dependencies: ['chromium'],
    },
    // Changes the built sw.js, so it runs alone after all other Chromium tests.
    {
      name: 'chromium-update',
      use: { ...devices['Desktop Chrome'], launchOptions: { executablePath } },
      testMatch: /update-notice\.spec\.ts/,
      dependencies: ['chromium-perf'],
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
