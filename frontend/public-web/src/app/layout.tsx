import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "A2 Eventos | Credenciamento",
  description: "Plataforma Inteligente de Gestão de Bordo, Controle de Acesso e Credenciamento Biométrico B2B/B2C.",
  manifest: "/manifest.webmanifest",
  themeColor: "#020617",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "A2 Acesso",
  },
  viewport: "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=0",
};

import { I18nProvider } from '@/components/I18nProvider';

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', function() {
                  navigator.serviceWorker.register('/sw.js').then(
                    function(registration) {},
                    function(err) { console.log('ServiceWorker registration failed: ', err); }
                  );
                });
              }
            `,
          }}
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <I18nProvider>
          {children}
        </I18nProvider>
      </body>
    </html>
  );
}
