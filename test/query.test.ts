import { describe, expect, it } from 'vitest'
import { createTwoslasher } from '../src/index'

const code = await import('./fixtures/query-basic.tsx?raw').then(m => m.default)

const twoslasher = createTwoslasher()

describe('basic', () => {
  const result = twoslasher(code, 'tsx')

  it('has correct hover types', () => {
    expect(result.nodes.find(n => n.type === 'hover' && n.target === 'button'))
      .toHaveProperty('text', '(property) button: ButtonHTMLAttributes & ReservedProps')
    expect(result.nodes.find(n => n.type === 'hover' && n.target === 'onClick'))
      .toHaveProperty('text', `(property) onClick?: ((payload: MouseEvent) => void) | undefined`)
  })

  it('has correct query', () => {
    expect(result.meta.positionQueries)
      .toMatchInlineSnapshot(`
        [
          15,
          83,
          177,
          270,
        ]
      `)

    expect(result.nodes.find(n => n.type === 'query' && n.target === 'double'))
      .toHaveProperty('text', 'const double: ComputedRef<number>')

    expect(result.nodes.find(n => n.type === 'query' && n.target === 'computed'))
      .toMatchInlineSnapshot(`
        {
          "character": 14,
          "docs": undefined,
          "length": 8,
          "line": 0,
          "start": 14,
          "tags": undefined,
          "target": "computed",
          "text": "(alias) const computed: {
            <T>(getter: ComputedGetter<T>, debugOptions?: DebuggerOptions): ComputedRef<T>;
            <T, S = T>(options: WritableComputedOptions<T, S>, debugOptions?: DebuggerOptions): WritableComputedRef<T, S>;
        }
        import computed",
          "type": "query",
        }
      `)

    expect(result.nodes.find(n => n.type === 'query' && n.target === 'count'))
      .toMatchInlineSnapshot(`
        {
          "character": 19,
          "docs": undefined,
          "length": 5,
          "line": 8,
          "start": 222,
          "tags": undefined,
          "target": "count",
          "text": "const count: Ref<number, number>",
          "type": "query",
        }
      `)

    expect(result.nodes.find(n => n.type === 'query' && n.target === 'onClick'))
      .toMatchInlineSnapshot(`
        {
          "character": 12,
          "docs": undefined,
          "length": 7,
          "line": 7,
          "start": 146,
          "tags": undefined,
          "target": "onClick",
          "text": "(property) onClick?: ((payload: MouseEvent) => void) | undefined",
          "type": "query",
        }
      `)
    expect(result.nodes.filter(n => n.type === 'query'))
      .toHaveLength(4)
  })
})
