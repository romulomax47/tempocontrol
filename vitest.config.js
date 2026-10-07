import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  test: {
    // The standard worker bootstrap times out in this Windows environment.
    // A VM thread runs the same suite and assertions in an isolated context.
    pool: 'vmThreads',
    maxWorkers: 1,
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.js'],
    // Never connect test runs to a real project through a developer's .env.local.
    env: { VITE_SUPABASE_URL: '', VITE_SUPABASE_PUBLISHABLE_KEY: '' },
  },
});
