import type { StrongEntry, Testament } from './types'

export const MAX_LEXICON_ENTRIES = 20_000

export function parseLexiconImport(json: string): StrongEntry[] {
  let value: unknown
  try {
    value = JSON.parse(json) as unknown
  } catch {
    throw new Error('Lexicon file is not valid JSON.')
  }
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_LEXICON_ENTRIES) {
    throw new Error(`Lexicon JSON must contain between 1 and ${MAX_LEXICON_ENTRIES.toLocaleString()} entries.`)
  }
  const entries = value.map(validateEntry)
  return [...new Map(entries.map((entry) => [entry.code, entry])).values()]
}

function validateEntry(value: unknown, index: number): StrongEntry {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Lexicon entry ${index + 1} must be an object.`)
  }
  const entry = value as Record<string, unknown>
  const textFields = ['code', 'lemma', 'transliteration', 'pronunciation', 'definition', 'derivation', 'partOfSpeech']
  for (const field of textFields) {
    if (typeof entry[field] !== 'string' || !entry[field].trim()) {
      throw new Error(`Lexicon entry ${index + 1} is missing "${field}".`)
    }
  }
  if (!/^[GH]\d{1,5}[a-z]?$/i.test(entry.code as string)) {
    throw new Error(`Lexicon entry ${index + 1} has an invalid Strong’s code.`)
  }
  const expectedTestament: Testament = (entry.code as string).toUpperCase().startsWith('G') ? 'Greek' : 'Hebrew'
  if (entry.testament !== expectedTestament) {
    throw new Error(`Lexicon entry ${index + 1} has a testament that does not match its Strong’s code.`)
  }
  if (!Number.isInteger(entry.kjvCount) || (entry.kjvCount as number) < 0) {
    throw new Error(`Lexicon entry ${index + 1} has an invalid occurrence count.`)
  }
  if (entry.linkedStudy !== undefined && typeof entry.linkedStudy !== 'string') {
    throw new Error(`Lexicon entry ${index + 1} has an invalid linked-study value.`)
  }
  return {
    code: (entry.code as string).toUpperCase(),
    testament: expectedTestament,
    lemma: (entry.lemma as string).trim(),
    transliteration: (entry.transliteration as string).trim(),
    pronunciation: (entry.pronunciation as string).trim(),
    definition: (entry.definition as string).trim(),
    derivation: (entry.derivation as string).trim(),
    partOfSpeech: (entry.partOfSpeech as string).trim(),
    kjvCount: entry.kjvCount as number,
    ...(typeof entry.linkedStudy === 'string' ? { linkedStudy: entry.linkedStudy.trim() } : {}),
  }
}
