import * as path from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    restoreMocks: true,
  },
  resolve: {
    alias: {
      vscode: path.resolve(__dirname, 'src/test/vscodeMock.ts'),
    },
  },
});
