import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const cryptoShim = fileURLToPath(new URL('./src/shims/crypto.ts', import.meta.url));

// Dev proxy: the sensor/responder containers don't send CORS headers, so the
// dashboard talks to them through the Vite origin.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // @butterbase/shared imports Node crypto; browsers have crypto.randomUUID
      crypto: cryptoShim,
      'node:crypto': cryptoShim,
    },
  },
  server: {
    proxy: {
      '/sensor': { target: 'http://localhost:3003', rewrite: (p) => p.replace(/^\/sensor/, '') },
      '/responder': { target: 'http://localhost:3004', rewrite: (p) => p.replace(/^\/responder/, '') },
    },
  },
});
