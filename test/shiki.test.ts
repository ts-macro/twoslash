import { createTransformerFactory, rendererRich } from '@shikijs/twoslash/core'
import { createHighlighter } from 'shiki'
import { expect, it } from 'vitest'
import { createTwoslasher } from '../src'

const code = await import('./fixtures/example.tsx?raw').then(m => m.default)

const styleHeader = [
  '<head>',
  `<link rel="stylesheet" href="https://esm.sh/@shikijs/twoslash@1.0.0-beta.5/style-rich.css" />`,
  `<style>:root { color-scheme: dark; --twoslash-popup-bg: #222; }</style>`,
  '</head>',
  '',
].join('\n')

const twoslasherTsm = createTwoslasher()
const shiki = await createHighlighter({
  themes: [
    'vitesse-dark',
  ],
  langs: [
    'ts',
    'tsx',
  ],
})

it('highlight tsx', async () => {
  const result = await shiki.codeToHtml(code, {
    lang: 'tsx',
    theme: 'vitesse-dark',
    transformers: [
      createTransformerFactory(twoslasherTsm)({
        langs: ['ts', 'tsx'],
        renderer: rendererRich({
          lang: 'ts',
        }),
        twoslashOptions: {
          compilerOptions: {
            jsx: 1,
            jsxImportSource: 'vue',
            types: ['vue/jsx'],
          },
        },
      }),
    ],
  })

  await expect(styleHeader + result)
    .toMatchFileSnapshot('./results/renderer/example.tsx.html')
})

const twoslasherRaw = createTwoslasher({
  debugShowGeneratedCode: true,
})

it('highlight raw', async () => {
  const result = await shiki.codeToHtml(code, {
    lang: 'tsx',
    theme: 'vitesse-dark',
    transformers: [
      createTransformerFactory(twoslasherRaw)({
        langs: ['ts', 'tsx'],
        renderer: rendererRich({
          lang: 'ts',
        }),
        twoslashOptions: {
          compilerOptions: {
            jsx: 1,
            jsxImportSource: 'vue',
            types: ['vue/jsx'],
          },
        },
      }),
    ],
  })

  await expect(styleHeader + result)
    .toMatchFileSnapshot('./results/renderer/example.raw.html')
})
