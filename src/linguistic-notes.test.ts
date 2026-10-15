import { describe, expect, it } from 'vitest'
import { findLinguisticNote, linguisticNotes } from './linguistic-notes'

describe('curated linguistic notes', () => {
  it('provides source-linked notes for the targeted language examples', () => {
    expect(linguisticNotes.map((note) => note.code)).toEqual(['H1288', 'H2617', 'G1242', 'G2205', 'G5331'])
    expect(linguisticNotes.every((note) => note.lexiconUrl.startsWith('https://'))).toBe(true)
    expect(linguisticNotes.every((note) => note.references.length > 0)).toBe(true)
  })

  it('matches Strong’s codes without case sensitivity or surrounding whitespace', () => {
    expect(findLinguisticNote(' g1242 ')?.transliteration).toBe('diathēkē')
    expect(findLinguisticNote('g99999')).toBeUndefined()
  })

  it('describes H1288 as a context-bound euphemism, not a general contronym', () => {
    const note = findLinguisticNote('H1288')
    expect(note?.kind).toBe('Euphemistic usage')
    expect(note?.explanation).toContain('not a general opposite meaning')
  })

  it('distinguishes contextual senses from literal opposites', () => {
    expect(findLinguisticNote('G2205')?.explanation).toContain('not literal opposites')
    expect(findLinguisticNote('G5331')?.explanation).toContain('etymological connection')
    expect(findLinguisticNote('H2617')?.kind).toBe('Rare lexical sense')
  })
})
