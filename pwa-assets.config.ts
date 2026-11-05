/**
 * pnpm gen:icons: the app icons in public/, made from public/favicon.svg. Run it after
 * changing the favicon and commit the results.
 */
import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config'
import { tokenColors } from './scripts/theme-colors.ts'

const paper = tokenColors('paper').light

export default defineConfig({
  headLinkOptions: { preset: '2023' },
  preset: {
    ...minimal2023Preset,
    maskable: { ...minimal2023Preset.maskable, resizeOptions: { background: paper } },
    apple: { ...minimal2023Preset.apple, resizeOptions: { background: paper } },
  },
  images: ['public/favicon.svg'],
})
