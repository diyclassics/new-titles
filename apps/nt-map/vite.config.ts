import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Repo-agnostic base path. Set VITE_BASE_PATH=/<repo-name>/ for GH Pages,
// or leave unset (defaults to '/') for a custom domain or local dev.
export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE_PATH ?? '/',
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
