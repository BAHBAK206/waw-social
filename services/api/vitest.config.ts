import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globalSetup: './test/global-setup.ts',
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 60000,
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? 'postgres://qubedu:qubedu@localhost:5432/qubedu_test',
      LOG_LEVEL: 'silent',
      STORAGE_DIR: './.local/test-storage',
      ROOT_ADMIN_EMAIL: 'root@qubedu.test',
    },
  },
});
