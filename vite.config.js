import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const devServer = {
  '/api': {
    target: 'http://localhost:8080',
    changeOrigin: true,
    configure: (proxy) => {
      proxy.on('proxyReq', (proxyReq) => proxyReq.removeHeader('origin'));
    },
  },
};

export default defineConfig({
  plugins: [react()],
  server: { proxy: devServer },
});
