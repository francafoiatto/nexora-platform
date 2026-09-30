/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv, type Plugin } from 'vite';

/**
 * Emits Cloudflare Pages static-host files into the build:
 * - `_redirects`: SPA fallback so deep links (/app/:id/...) load index.html instead of a 404;
 * - `_headers`: CSP and security headers. `connect-src` allows only this origin plus the API origin
 *   derived from VITE_API_URL / VITE_SOCKET_URL (https + wss), so no URL is hardcoded here.
 */
function staticHostFiles(env: Record<string, string>): Plugin {
  const origins = new Set<string>();
  for (const url of [env.VITE_API_URL, env.VITE_SOCKET_URL]) {
    if (!url || !/^https?:\/\//.test(url)) continue;
    const { origin, host, protocol } = new URL(url);
    origins.add(origin);
    origins.add(`${protocol === 'https:' ? 'wss' : 'ws'}://${host}`);
  }
  const csp = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    // React sets a few dynamic style attributes (progress widths); no inline <style>/<script> is allowed.
    "style-src-attr 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    `connect-src ${['self', ...origins].map((o) => (o === 'self' ? "'self'" : o)).join(' ')}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
  return {
    name: 'nexora-static-host-files',
    apply: 'build',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: '_redirects', source: '/*  /index.html  200\n' });
      this.emitFile({
        type: 'asset',
        fileName: '_headers',
        source: [
          '/*',
          `  Content-Security-Policy: ${csp}`,
          '  X-Content-Type-Options: nosniff',
          '  Referrer-Policy: strict-origin-when-cross-origin',
          '  X-Frame-Options: DENY',
          '  Permissions-Policy: camera=(), microphone=(), geolocation=()',
          '/assets/*',
          '  Cache-Control: public, max-age=31536000, immutable',
          '',
        ].join('\n'),
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  // In development the API is proxied, so the browser talks to a single origin (no CORS).
  const target = env.VITE_PROXY_TARGET || 'http://127.0.0.1:3000';
  const proxy = {
    '/api': { target, changeOrigin: true },
    '/socket.io': { target, ws: true, changeOrigin: true },
  };
  return {
    plugins: [react(), staticHostFiles(env)],
    server: { port: Number(env.WEB_PORT) || 5173, strictPort: true, proxy },
    preview: { port: Number(env.WEB_PORT) || 4173, proxy },
    build: { sourcemap: true },
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      include: ['src/**/*.test.{ts,tsx}'],
      css: false,
      restoreMocks: true,
    },
  };
});
