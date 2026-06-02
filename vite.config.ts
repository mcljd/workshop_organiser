import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'

// Set SINGLEFILE=1 to inline JS + CSS into a single self-contained index.html.
// We use this build to serve the app from a Supabase Edge Function (one file,
// no asset hosting needed). The normal `vite build` is unaffected.
const singleFile = process.env.SINGLEFILE === '1'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), ...(singleFile ? [viteSingleFile()] : [])],
  build: {
    // Split the heavy 3D libraries into their own chunk so they cache across
    // deploys and the app shell loads first. (Skipped for the single-file
    // embed build, which must stay one file.)
    rollupOptions: singleFile
      ? {}
      : {
          output: {
            manualChunks: {
              three: ['three'],
              r3f: ['@react-three/fiber', '@react-three/drei'],
              react: ['react', 'react-dom'],
            },
          },
        },
  },
})
