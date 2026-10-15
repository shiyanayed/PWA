import Dexie, { type EntityTable } from 'dexie'
import { apologeticsDossiers, seedStudies, strongEntries } from './data'
import type { ApologeticsDossier, StrongEntry, WordStudy } from './types'

interface SettingRecord {
  key: string
  value: string
}

class WordContextDatabase extends Dexie {
  studies!: EntityTable<WordStudy, 'id'>
  lexicon!: EntityTable<StrongEntry, 'code'>
  dossiers!: EntityTable<ApologeticsDossier, 'id'>
  settings!: EntityTable<SettingRecord, 'key'>

  constructor() {
    super('word-context')
    this.version(1).stores({
      studies: 'id, word, testament, strongsNumber, isFavorite, updatedAt',
      lexicon: 'code, testament, lemma, transliteration',
      dossiers: 'id, category, title',
      settings: 'key',
    })
  }
}

export const db = new WordContextDatabase()

export async function initializeKnowledgeBase(): Promise<void> {
  await db.transaction('rw', db.studies, db.lexicon, db.dossiers, async () => {
    const existingStudyIds = new Set(await db.studies.where('id').anyOf(seedStudies.map((study) => study.id)).primaryKeys())
    const newStudies = seedStudies.filter((study) => !existingStudyIds.has(study.id))
    if (newStudies.length) await db.studies.bulkAdd(newStudies)

    const existingLexiconCodes = new Set(await db.lexicon.where('code').anyOf(strongEntries.map((entry) => entry.code)).primaryKeys())
    const newEntries = strongEntries.filter((entry) => !existingLexiconCodes.has(entry.code))
    if (newEntries.length) await db.lexicon.bulkAdd(newEntries)

    const existingDossierIds = new Set(await db.dossiers.where('id').anyOf(apologeticsDossiers.map((dossier) => dossier.id)).primaryKeys())
    const newDossiers = apologeticsDossiers.filter((dossier) => !existingDossierIds.has(dossier.id))
    if (newDossiers.length) await db.dossiers.bulkAdd(newDossiers)
  })
}
