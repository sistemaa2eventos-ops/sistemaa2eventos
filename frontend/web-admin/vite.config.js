import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
    plugins: [
        react(),
        VitePWA({
            registerType: 'autoUpdate',
            workbox: {
                globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
                maximumFileSizeToCacheInBytes: 5 * 1024 * 1024
            },
            manifest: {
                name: 'NZT Intelligent Control System',
                short_name: 'NZT',
                description: 'Controle de acesso e credenciamento de eventos — desenvolvido por A2',
                theme_color: '#050B18',
                background_color: '#050B18',
                display: 'standalone',
                icons: [
                    {
                        src: 'pwa-192x192.png',
                        sizes: '192x192',
                        type: 'image/png'
                    },
                    {
                        src: 'pwa-512x512.png',
                        sizes: '512x512',
                        type: 'image/png'
                    }
                ]
            }
        })
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
        chunkSizeWarningLimit: 1600,
        rollupOptions: {
            output: {
                manualChunks(id) {
                    if (!id.includes('node_modules')) return undefined;
                    // Bibliotecas pesadas usadas só por algumas telas ficam fora do vendor:
                    // são baixadas junto com a tela que as usa (tabela avançada ~360 KB,
                    // leitor de QR ~330 KB, webcam, arrastar/redimensionar).
                    if (/node_modules[\/](@mui[\/]x-data-grid|html5-qrcode|react-webcam|react-rnd|re-resizable|react-draggable)[\/]/.test(id)) {
                        return undefined;
                    }
                    return 'vendor';
                }
            }
        }
    }
})
