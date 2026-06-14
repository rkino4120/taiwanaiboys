// @ts-check
import { defineConfig, fontProviders } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import react from '@astrojs/react';

import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  output: 'static',
  adapter: cloudflare(),
  integrations: [react()],
  fonts: [
    {
      provider: fontProviders.google(),
      name: "Sawarabi Gothic",
      cssVariable: "--font-sawarabi-gothic",
      subsets: ["latin", "japanese"],
    },
    {
      provider: fontProviders.google(),
      name: "Shippori Mincho",
      cssVariable: "--font-shippori-mincho",
      subsets: ["latin", "japanese"],
    },
    {
      provider: fontProviders.google(),
      name: "Noto Sans TC",
      cssVariable: "--font-noto-sans-tc",
      subsets: ["latin", "chinese-traditional"],
    },
    {
      provider: fontProviders.google(),
      name: "Noto Serif TC",
      cssVariable: "--font-noto-serif-tc",
      subsets: ["latin", "chinese-traditional"],
    },
  ],
  vite: {
    plugins: [tailwindcss()]
  }
});