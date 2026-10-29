import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
    plugins: [
        react(),
        VitePWA({
            registerType: 'autoUpdate',
            injectRegister: false,
            filename: 'sw-v2.js',
            includeAssets: ['favicon.ico', 'favicon-32x32.png', 'apple-touch-icon.png'],
            workbox: {
                globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
                // Fora do pré-carregamento (~3 MB a menos na instalação, que é o que o celular baixa):
                // modelo de rosto do cadastro (exige internet), avatares, ícones grandes do app e a
                // Auditoria (só admin). Check-in, checkout e leitor de QR seguem pré-carregados (offline).
                globIgnores: ['**/config.js', '**/sw*.js', '**/workbox-*.js',
                    'face-api/**', 'avatars/**', 'pwa-*.png', 'assets/AuditLogs-*.js'],
                maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
                cleanupOutdatedCaches: true,
                skipWaiting: true,
                clientsClaim: true,
                navigateFallbackDenylist: [/^\/api\//, /^\/socket\.io\//],
                // O que ficou fora entra no cache na 1ª vez que for usado
                runtimeCaching: [
                    {
                        urlPattern: ({ url }) => url.pathname.startsWith('/assets/'),
                        handler: 'CacheFirst', // nome com hash: o arquivo nunca muda
                        options: { cacheName: 'nzt-assets', expiration: { maxEntries: 80, maxAgeSeconds: 30 * 24 * 3600 } }
                    },
                    {
                        urlPattern: ({ url }) => /^\/(face-api|avatars)\//.test(url.pathname),
                        handler: 'StaleWhileRevalidate',
                        options: { cacheName: 'nzt-recursos', expiration: { maxEntries: 60 } }
                    }
                ]
            },
            manifest: {
                name: 'NZT Intelligent Control System',
                short_name: 'NZT',
                description: 'Controle de acesso e credenciamento de eventos — desenvolvido por A2',
                theme_color: '#050B18',
                background_color: '#050B18',
                display: 'standalone',
                icons: [
                    { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
                    { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
                    // Android recorta em círculo/gota: versão com margem segura
                    { src: 'pwa-maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
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
                    if (/node_modules[/\\](@mui[/\\]x-data-grid|html5-qrcode|react-webcam|react-rnd|re-resizable|react-draggable)[/\\]/.test(id)) {
                        return undefined;
                    }
                    return 'vendor';
                }
            }
        }
    }
})
