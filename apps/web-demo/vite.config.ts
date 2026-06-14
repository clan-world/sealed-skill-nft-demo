import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: process.env.VITE_DEV_HOST ?? '127.0.0.1',
    port: 5173,
    allowedHosts: ['nft.clan-world.com', 'localhost', '127.0.0.1']
  },
  define: {
    'process.env': {}
  }
});
