import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Relative paths also work when GitHub Pages serves this app under /<repo>/.
  base: './'
});
