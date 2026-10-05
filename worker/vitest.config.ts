import { cloudflareTest } from '@cloudflare/vitest-pool-workers';
import { defineConfig } from 'vitest/config';

// 盤面（worker/）のテスト。Workers のランタイム（Miniflare）の中で動かす。npm run test:worker
export default defineConfig({
  plugins: [cloudflareTest({ wrangler: { configPath: '../wrangler.jsonc' } })],
  test: { include: ['test/**/*.test.ts'] },
});
