import type { Language, SourceScript } from '@volar/language-core'
import type { Options as TsmCompilerOptions } from 'ts-macro'
import type {
  CompilerOptionDeclaration,
  CreateTwoslashOptions,
  HandbookOptions,
  ParsedFlagNotation,
  Range,
  TwoslashExecuteOptions,
  TwoslashInstance,
  TwoslashReturnMeta,
} from 'twoslash'
import type { CompilerOptions } from 'typescript'
import { getLanguagePlugins } from '@ts-macro/language-plugin'
import { createLanguage, defaultMapperFactory, FileMap } from '@volar/language-core'
import { createPlugin } from 'ts-macro'
import {
  createTwoslasher as createTwoslasherBase,
  defaultCompilerOptions,
  defaultHandbookOptions,
  findFlagNotations,
  findQueryMarkers,
  getObjectHash,
} from 'twoslash'
import {
  createPositionConverter,
  removeCodeRanges,
  resolveNodePositions,
} from 'twoslash-protocol'
import ts from 'typescript'

export interface TsmSpecificOptions {
  /**
   * TS Macro Compiler options
   */
  tsmCompilerOptions?: Partial<TsmCompilerOptions>
}

export interface CreateTwoslashTsmOptions extends CreateTwoslashOptions, TsmSpecificOptions {
  /**
   * Render the generated code in the output instead of the TSM file
   *
   * @default false
   */
  debugShowGeneratedCode?: boolean
}

export interface TwoslashTsmExecuteOptions extends TwoslashExecuteOptions {
}

const placeholderPlugin = createPlugin(() => {
  return {
    name: 'ts-macro-placeholder',
    resolveVirtualCode() {},
  }
})

/**
 * Create a twoslasher instance that add additional support for TSM.
 */
export function createTwoslasher(createOptions: CreateTwoslashTsmOptions = {}): TwoslashInstance {
  const twoslasherBase = createTwoslasherBase(createOptions)
  const cache = twoslasherBase.getCacheMap() as any as Map<string, Language> | undefined
  const tsOptionDeclarations = (ts as any).optionDeclarations as CompilerOptionDeclaration[]

  function getTsmLanguage(compilerOptions: Partial<CompilerOptions>, tsmCompilerOptions: TsmCompilerOptions) {
    if (!cache)
      return getLanguage()
    const key = `tsm:${getObjectHash([compilerOptions, tsmCompilerOptions])}`
    if (!cache.has(key)) {
      const env = getLanguage()
      cache.set(key, env)
      return env
    }
    return cache.get(key)!

    function getLanguage() {
      return createLanguage(
        getLanguagePlugins(ts, defaultCompilerOptions, {
          plugins: tsmCompilerOptions.plugins ?? [placeholderPlugin()],
        }),
        new FileMap(ts.sys.useCaseSensitiveFileNames) as unknown as Map<string, SourceScript<string>>,
        () => {},
      )
    }
  }

  function twoslasher(code: string, extension?: string, options: TwoslashTsmExecuteOptions = {}) {
    // createOptions
    const tsmCompilerOptions: Partial<TsmCompilerOptions> = createOptions.tsmCompilerOptions ?? { plugins: [] }
    const compilerOptions: Partial<CompilerOptions> = {
      ...defaultCompilerOptions,
      noImplicitAny: false,
      ...options.compilerOptions,
      ...createOptions.compilerOptions,
    }
    const handbookOptions: Partial<HandbookOptions> = {
      ...defaultHandbookOptions,
      noErrorsCutted: true,
      ...options.handbookOptions,
    }

    const sourceMeta = {
      removals: [] as Range[],
      positionCompletions: [] as number[],
      positionQueries: [] as number[],
      positionHighlights: [] as TwoslashReturnMeta['positionHighlights'],
      flagNotations: [] as ParsedFlagNotation[],
    } satisfies Partial<TwoslashReturnMeta>

    const {
      customTags = createOptions.customTags || [],
    } = options

    const pc = createPositionConverter(code)
    // we get the markers with the original code so the position is correct
    findQueryMarkers(code, sourceMeta, pc)
    const flagNotations = findFlagNotations(code, customTags, tsOptionDeclarations)

    // #region apply flags
    for (const flag of flagNotations) {
      switch (flag.type) {
        case 'unknown':
          continue

        case 'compilerOptions':
          compilerOptions[flag.name] = flag.value
          break
        case 'handbookOptions':
          // @ts-expect-error ignore
          handbookOptions[flag.name] = flag.value
          break
      }
      sourceMeta.removals.push([flag.start, flag.end])
    }
    // #endregion

    // replace non-whitespace in the already extracted markers
    let strippedCode = code
    for (const [start, end] of sourceMeta.removals) {
      strippedCode
       = strippedCode.slice(0, start)
         + strippedCode.slice(start, end).replace(/\S/g, ' ')
         + strippedCode.slice(end)
    }

    const lang = getTsmLanguage(compilerOptions, tsmCompilerOptions)
    const sourceScript = lang.scripts.set('index.tsx', ts.ScriptSnapshot.fromString(strippedCode), 'typescriptreact')!
    if (!sourceScript?.generated) {
      return twoslasherBase(code, extension, options)
    }

    const fileCompiled = get(sourceScript.generated.embeddedCodes.values(), 0)!
    const compiled = fileCompiled.snapshot.getText(0, fileCompiled.snapshot.getLength())

    const map = defaultMapperFactory(fileCompiled.mappings)

    function getLastGeneratedOffset(pos: number) {
      const offsets = [...map.toGeneratedLocation(pos)]
      if (!offsets.length)
        return undefined
      return offsets[offsets.length - 1]?.[0]
    }

    // Pass compiled to TS file to twoslash
    const result = twoslasherBase(compiled, 'tsx', {
      ...options,
      compilerOptions,
      handbookOptions: {
        ...handbookOptions,
        keepNotations: true,
      },
      shouldGetHoverInfo(id) {
        // ignore internal types
        return !id.startsWith('__VLS')
      },
      positionCompletions: sourceMeta.positionCompletions
        .map(p => getLastGeneratedOffset(p)!),
      positionQueries: sourceMeta.positionQueries
        .map(p => get(map.toGeneratedLocation(p), 0)?.[0])
        .filter(isNotNull),
      positionHighlights: sourceMeta.positionHighlights
        .map(([start, end]) => [
          get(map.toGeneratedLocation(start), 0)?.[0],
          get(map.toGeneratedLocation(end), 0)?.[0],
        ])
        .filter((x): x is [number, number] => x[0] != null && x[1] != null),
    })

    if (createOptions.debugShowGeneratedCode)
      return result

    // Map the tokens
    const mappedNodes = result.nodes
      .map((q) => {
        if ('text' in q && q.text === 'any')
          return undefined
        const startMap = get(map.toSourceLocation(q.start), 0)
        if (!startMap)
          return undefined
        const start = startMap[0]
        let end = get(map.toSourceLocation(q.start + q.length), 0)?.[0]
        if (end == null && startMap[1].sourceOffsets[0] === startMap[0])
          end = startMap[1].sourceOffsets[1]
        if (end == null || start < 0 || end < 0 || start > end)
          return undefined
        return Object.assign(q, {
          ...q,
          target: code.slice(start, end),
          start: startMap[0],
          length: end - start,
        })
      })
      .filter(isNotNull)

    const mappedRemovals = [
      ...sourceMeta.removals,
      ...result.meta.removals.map((r) => {
        const start = get(map.toSourceLocation(r[0]), 0)?.[0] ?? code.match(/(?<=<script[\s\S]*>\s)/)?.index
        const end = get(map.toSourceLocation(r[1]), 0)?.[0]
        if (start == null || end == null || start < 0 || end < 0 || start >= end)
          return undefined
        return [start, end] as Range
      }).filter(isNotNull),
    ]

    if (!options.handbookOptions?.keepNotations) {
      const removed = removeCodeRanges(code, mappedRemovals, mappedNodes)
      result.code = removed.code
      result.meta.removals = removed.removals
      result.nodes = resolveNodePositions(removed.nodes, result.code)
    }
    else {
      result.meta.removals = mappedRemovals
    }

    result.nodes = result.nodes.filter((n, idx) => {
      const next = result.nodes[idx + 1]
      if (!next)
        return true
      // When multiple nodes are on the same position, we keep the last one by ignoring the previous ones
      if (next.type === n.type && next.start === n.start)
        return false
      return true
    })

    result.meta.extension = 'tsx'

    return result
  }

  twoslasher.getCacheMap = twoslasherBase.getCacheMap

  return twoslasher
}

function isNotNull<T>(x: T | null | undefined): x is T {
  return x != null
}

function get<T>(iterator: IterableIterator<T> | Generator<T>, index: number): T | undefined {
  for (const item of iterator) {
    if (index-- === 0)
      return item
  }
  return undefined
}
