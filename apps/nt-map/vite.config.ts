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
    // Vendor chunks keep their own hash so repeat visits don't re-download
    // React or Leaflet when only our code changes.
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom'],
          leaflet: ['leaflet', 'leaflet.markercluster', 'react-leaflet'],
        },
      },
    },
    chunkSizeWarningLimit: 600,
  },
});
