import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const allowedHosts = [
  'nft.clan-world.com',
  'localhost',
  '127.0.0.1',
  ...parseCommaList(process.env.VITE_DEV_ALLOWED_HOSTS)
];

export default defineConfig({
  plugins: [react()],
  server: {
    host: process.env.VITE_DEV_HOST ?? '127.0.0.1',
    port: 5173,
    allowedHosts
  },
  define: {
    'process.env': {}
  }
});

function parseCommaList(value: string | undefined): string[] {
  return value?.split(',').map((item) => item.trim()).filter(Boolean) ?? [];
}
