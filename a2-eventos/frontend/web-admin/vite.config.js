import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
    plugins: [
        react()
    ],
    server: {
        port: 5173,
        host: true,
        strictPort: true,
        proxy: {
            '/api': {
                target: 'http://localhost:3001',
                changeOrigin: true
            },
            '/socket.io': {
                target: 'http://localhost:3001',
                ws: true,
                changeOrigin: true
            }
        },
        hmr: {
            overlay: true
        }
    },
    build: {
        sourcemap: false,
        minify: 'esbuild',
        chunkSizeWarningLimit: 2500,
        rollupOptions: {
            output: {
                manualChunks(id) {
                    if (id.includes('node_modules')) {
                        return 'vendor';
                    }
                }
            }
        }
    }
})
