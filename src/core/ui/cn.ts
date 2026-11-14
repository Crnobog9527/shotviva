import { clsx, type ClassValue } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

// tailwind-merge has to know the theme's own names (globals.css @theme), or it reads
// `text-caption` as a colour and drops it next to `text-foreground`.
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: ['caption', 'label', 'body', 'cta', 'headline', 'h1', 'title', 'large-title'],
      radius: ['tag', 'inner', 'button', 'control', 'tile', 'media', 'panel', 'sheet'],
      font: ['display'],
    },
    classGroups: {
      shadow: ['shadow-raised', 'shadow-sheet', 'hairline', 'hairline-lit'],
    },
  },
})

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}
