import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), basicSsl()],
  server: {
    host: true, // Expose to network for phone testing
    hmr: false, // Disable hot module replacement (auto-reload)
    proxy: {
      '/duke-img': {
        target: 'https://shop.duke.edu',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/duke-img/, '/site/img'),
        secure: false
      }
    }
  }
})
