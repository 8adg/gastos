import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  define: {
    // Permite que process.env esté disponible en el cliente si es necesario, 
    // aunque lo ideal es que el SDK lo tome del entorno global inyectado.
    'process.env.API_KEY': JSON.stringify(process.env.API_KEY)
  },
  server: {
    open: false, // Evita el error spawn xdg-open ENOENT
    port: 5173
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false
  }
});
