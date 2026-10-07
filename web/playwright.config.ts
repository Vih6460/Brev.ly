import { defineConfig, devices } from '@playwright/test';

const databaseUrl = process.env.E2E_DATABASE_URL;
if (!databaseUrl || !new URL(databaseUrl).pathname.endsWith('_test')) {
  throw new Error(
    'Configure E2E_DATABASE_URL para um banco migrado separado cujo nome termine em _test.',
  );
}

export default defineConfig({
  testDir: './e2e',
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  timeout: 30_000,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5174',
    channel: process.env.PLAYWRIGHT_CHANNEL,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 720 } },
    },
    {
      name: 'mobile',
      use: { ...devices['Pixel 7'], viewport: { width: 390, height: 788 } },
    },
  ],
  webServer: [
    {
      command: 'npm run dev -w server',
      cwd: '..',
      url: 'http://localhost:3334/health',
      env: {
        DATABASE_URL: databaseUrl,
        PORT: '3334',
        HOST: '127.0.0.1',
        FRONTEND_URL: 'http://localhost:5174',
        CORS_ORIGIN: 'http://localhost:5174',
        CLOUDFLARE_ACCOUNT_ID: '',
        CLOUDFLARE_ACCESS_KEY_ID: '',
        CLOUDFLARE_SECRET_ACCESS_KEY: '',
        CLOUDFLARE_BUCKET: '',
        CLOUDFLARE_PUBLIC_URL: '',
      },
      reuseExistingServer: false,
    },
    {
      command: 'npm run dev -- --port 5174 --strictPort',
      url: 'http://localhost:5174',
      env: {
        VITE_FRONTEND_URL: 'http://localhost:5174',
        VITE_BACKEND_URL: 'http://localhost:3334',
      },
      reuseExistingServer: false,
    },
  ],
});
