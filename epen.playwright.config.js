import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/ui',
  outputDir: './.runtime/ux-results',
  fullyParallel: true,
  workers: 2,
  use: { baseURL: 'http://127.0.0.1:5178', channel: 'msedge', viewport: { width: 1366, height: 900 } },
  webServer: { command: 'npm run dev -- --port 5178', url: 'http://127.0.0.1:5178', reuseExistingServer: false },
});
