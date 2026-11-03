import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

/**
 * Dev server only: serves the running runtime's address and token at
 * /__myaos/runtime, so the UI can be opened in a plain browser during
 * development. The desktop app gets the same values from its Rust side.
 * Not part of any build. The runtime must allow this origin
 * (MYAOS_RUNTIME_ORIGINS=http://127.0.0.1:1430).
 */
function runtimeDiscovery(): Plugin {
  return {
    name: 'myaos-runtime-discovery',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__myaos/runtime', (_req, res) => {
        const file = process.env.MYAOS_RUNTIME_FILE ?? path.join(os.homedir(), '.myaos', 'runtime.json');
        try {
          const info = JSON.parse(fs.readFileSync(file, 'utf8')) as { url: string; token: string };
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ url: info.url, token: info.token }));
        } catch {
          res.statusCode = 503;
          res.end(`No runtime is running (${file} not found). Start it with: npm start --prefix runtime`);
        }
      });
    },
  };
}

// Port 1430, so this app can run beside the current desktop app (1420).
export default defineConfig({
  plugins: [react(), tailwindcss(), runtimeDiscovery()],
  clearScreen: false,
  server: {
    port: 1430,
    strictPort: true,
    host: '127.0.0.1',
    fs: { allow: [path.resolve(__dirname, '../..')] },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // Wire types shared with the runtime (type-only imports).
      '@runtime': path.resolve(__dirname, '../../runtime/src/api'),
    },
  },
});
