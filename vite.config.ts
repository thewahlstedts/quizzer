import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ isSsrBuild }) => ({
  plugins: [react()],
  // The SSR build is the online-play server (npm run build:server); it doesn't need public/.
  build: { copyPublicDir: !isSsrBuild },
  test: { environment: 'node' },
}) as never)
