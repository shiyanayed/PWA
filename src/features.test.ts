import { describe, expect, it } from 'vitest'
import { seedStudies, strongEntries } from './data'
import { createLexiconFallbackStudy, findLocalStudy } from './offline'
import { parseLexiconImport } from './lexicon-import'

describe('offline study lookup', () => {
  it('ships every curated word study named in the Android blueprint', () => {
    const expectedCodes = [
      'G1343', 'G1515', 'G1242', 'G40', 'G4102', 'G5485', 'G26', 'G2098',
      'G5206', 'G629', 'G1577', 'G2842', 'G3056', 'H6666', 'H7965', 'H1285',
      'H1288',
      'H6918', 'H530', 'H2580', 'H2617', 'H1350', 'H8085',
    ]
    expect(seedStudies.map((study) => study.strongsNumber).sort()).toEqual(expectedCodes.sort())
    expect(seedStudies.every((study) => study.keyScriptures.length > 0 && study.morphologicalFamilyTable.length > 0)).toBe(true)
  })

  it('has unique bundled study and lexicon identifiers', () => {
    expect(new Set(seedStudies.map((study) => study.id)).size).toBe(seedStudies.length)
    expect(new Set(strongEntries.map((entry) => entry.code)).size).toBe(strongEntries.length)
  })

  it('opens a stored study by Strong’s number without calling AI', () => {
    const result = findLocalStudy('g1343', seedStudies, strongEntries)
    expect(result.study?.word).toBe('Righteousness')
    expect(result.entry).toBeUndefined()
  })

  it('does not open a local study from the other testament when a testament is selected', () => {
    const result = findLocalStudy('shalom', seedStudies, strongEntries, 'Greek')
    expect(result.study).toBeUndefined()
    expect(result.entry).toBeUndefined()
  })

  it('finds a bundled lexicon entry by case-insensitive transliteration', () => {
    const result = findLocalStudy('SHALOM', seedStudies, strongEntries)
    expect(result.entry?.code).toBe('H7965')
    expect(result.study).toBeUndefined()
  })

  it('returns an entry for an uncached Strong’s code so the caller can provide an offline fallback', () => {
    const result = findLocalStudy('G629', [], strongEntries)
    expect(result.study).toBeUndefined()
    expect(result.entry?.code).toBe('G629')
  })

  it('makes an explicit lexicon-only study without inventing historical context', () => {
    const entry = strongEntries.find((item) => item.code === 'G26')
    if (!entry) throw new Error('Expected bundled G26 entry in the test fixture.')
    const study = createLexiconFallbackStudy(entry)
    expect(study.provenance).toBe('lexicon-fallback')
    expect(study.historicalBackground).toContain('No historical-background entry')
    expect(study.keyScriptures).toEqual([])
  })
})

describe('lexicon import validation', () => {
  it('accepts valid Greek and Hebrew entries and normalizes their Strong’s codes', () => {
    const entries = parseLexiconImport(JSON.stringify([
      { code: 'g26', testament: 'Greek', lemma: 'ἀγάπη', transliteration: 'agapē', pronunciation: 'ag-ah-pay', definition: 'Love', derivation: 'From G25', partOfSpeech: 'Noun', kjvCount: 116 },
      { code: 'H7965', testament: 'Hebrew', lemma: 'שָׁלוֹם', transliteration: 'shalom', pronunciation: 'sha-lome', definition: 'Peace', derivation: 'From H7999', partOfSpeech: 'Noun', kjvCount: 237 },
    ]))
    expect(entries.map((entry) => entry.code)).toEqual(['G26', 'H7965'])
  })

  it('rejects mismatched testament codes and malformed entries', () => {
    expect(() => parseLexiconImport(JSON.stringify([
      { code: 'G26', testament: 'Hebrew', lemma: 'ἀγάπη', transliteration: 'agapē', pronunciation: 'ag-ah-pay', definition: 'Love', derivation: 'From G25', partOfSpeech: 'Noun', kjvCount: 116 },
    ]))).toThrow('testament that does not match')
    expect(() => parseLexiconImport('not json')).toThrow('not valid JSON')
  })

  it('deduplicates imported entries by code', () => {
    const first = { code: 'G26', testament: 'Greek', lemma: 'ἀγάπη', transliteration: 'agapē', pronunciation: 'ag-ah-pay', definition: 'Love', derivation: 'From G25', partOfSpeech: 'Noun', kjvCount: 116 }
    const second = { ...first, definition: 'Love and affection' }
    const entries = parseLexiconImport(JSON.stringify([first, second]))
    expect(entries).toHaveLength(1)
    expect(entries[0].definition).toBe('Love and affection')
  })
})
