import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
    plugins: [
        react(),
        VitePWA({
            registerType: 'autoUpdate',
            injectRegister: false,
            filename: 'sw-produtor.js',
            includeAssets: ['favicon.ico', 'favicon-32x32.png', 'apple-touch-icon-v2.png'],
            workbox: {
                globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
                globIgnores: ['**/sw-produtor.js', '**/workbox-*.js', '**/pdf.worker.min-*.mjs'],
                maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
                cleanupOutdatedCaches: true,
                skipWaiting: true,
                clientsClaim: true,
                navigateFallbackDenylist: [/^\/api\//],
                runtimeCaching: [
                    {
                        urlPattern: ({ url }) => url.pathname.startsWith('/assets/'),
                        handler: 'CacheFirst',
                        options: {
                            cacheName: 'nzt-produtor-assets',
                            expiration: { maxEntries: 60, maxAgeSeconds: 30 * 24 * 3600 }
                        }
                    }
                ]
            },
            manifest: {
                name: 'NZT Produção — Portal do Produtor',
                short_name: 'NZT Produção',
                description: 'Aplicativo isolado da equipe de produção de campo — NZT Eventos',
                theme_color: '#050B18',
                background_color: '#050B18',
                display: 'standalone',
                orientation: 'portrait-primary',
                start_url: '/',
                scope: '/',
                icons: [
                    { src: '/favicon.ico', sizes: '48x48 32x32 16x16', type: 'image/x-icon', purpose: 'any' },
                    { src: '/pwa-128x128.png', sizes: '128x128', type: 'image/png', purpose: 'any' },
                    { src: '/pwa-192x192-v2.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
                    { src: '/pwa-256x256.png', sizes: '256x256', type: 'image/png', purpose: 'any' },
                    { src: '/pwa-512x512-v2.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
                    { src: '/pwa-maskable-512x512-v2.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
                ]
            }
        })
    ],
    server: {
        port: 5174,
        host: true,
        strictPort: true,
        proxy: {
            '/api': {
                target: 'http://localhost:3001',
                changeOrigin: true
            }
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
                    if (/node_modules[/\\]pdfjs-dist[/\\]/.test(id)) return undefined;
                    return 'vendor';
                }
            }
        }
    }
});
