import { defineConfig } from 'vite';
export default defineConfig({
  build: {
    target: 'es2022',
    rollupOptions: { input: { main: 'index.html', how: 'how-it-works.html' } },
  },
  plugins: [
    {
      name: 'single-thread-without-isolation',
      transform(code, id) {
        if (id.includes('@imgly/background-removal/dist/index.mjs'))
          return code.replace(
            'var maxNumThreads = () => navigator.hardwareConcurrency ?? 4;',
            'var maxNumThreads = () => globalThis.crossOriginIsolated ? (navigator.hardwareConcurrency ?? 4) : 1;',
          );
      },
    },
  ],
  server: {
    port: 5173,
    strictPort: true,
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  preview: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
});
