import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['src/test/setup.ts'],
    // Preserve raw token, mode color, motion and public responsive styles for contract tests.
    css: { include: [/tokens\.css/, /modes\.css/, /global\.css/, /landing\.css/] },
  },
});
