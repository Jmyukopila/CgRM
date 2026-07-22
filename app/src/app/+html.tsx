import { ScrollViewStyleReset } from 'expo-router/html';
import { type PropsWithChildren } from 'react';

const swRegistration = `
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
`;

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="es">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no, viewport-fit=cover" />
        <ScrollViewStyleReset />

        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#FAF6F0" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="Casa Gracia" />
        <link rel="apple-touch-icon" href="/pwa/icon-192.png" />

        <script dangerouslySetInnerHTML={{ __html: swRegistration }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
