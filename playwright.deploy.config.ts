import { existsSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

// Deploy smoke test: runs against servers started outside Playwright (see ci.yml), no webServer.
const localChromium = '/opt/pw-browsers/chromium';
const executablePath = !process.env.CI && existsSync(localChromium) ? localChromium : undefined;

export default defineConfig({
  testDir: 'tests/deploy',
  forbidOnly: !!process.env.CI,
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], launchOptions: { executablePath } },
    },
  ],
});
