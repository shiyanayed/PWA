import { describe, expect, it } from 'vitest'
import { patristicWitnesses } from './patristic'

describe('Patristic Archive excerpts', () => {
  it('includes source-linked witnesses across all three eras', () => {
    expect(patristicWitnesses).toHaveLength(9)
    expect(new Set(patristicWitnesses.map((witness) => witness.epoch))).toEqual(new Set([
      'Apostolic Fathers',
      'Ante-Nicene',
      'Nicene & Post-Nicene',
    ]))
    expect(patristicWitnesses.every((witness) => witness.sourceUrl.startsWith('https://'))).toBe(true)
  })

  it('keeps each excerpt tied to a work-level citation and context note', () => {
    expect(patristicWitnesses.every((witness) => witness.work.trim().length > 0)).toBe(true)
    expect(patristicWitnesses.every((witness) => witness.context.trim().length > 0)).toBe(true)
    expect(patristicWitnesses.find((witness) => witness.father === 'Basil of Caesarea')?.work).toBe('On the Holy Spirit 1.2')
  })
})
