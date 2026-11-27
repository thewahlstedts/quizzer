import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ isSsrBuild }) => ({
  plugins: [react()],
  // The SSR build is the online-play server (npm run build:server); it doesn't need public/.
  build: { copyPublicDir: !isSsrBuild },
  // Online play locally: run the server (npm run build:server && npm run server) and the app finds it on /ws.
  server: { proxy: { '/ws': { target: 'ws://localhost:8787', ws: true } } },
  preview: { proxy: { '/ws': { target: 'ws://localhost:8787', ws: true } } },
  test: { environment: 'node' },
}) as never)
