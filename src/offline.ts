import type { StrongEntry, Testament, WordStudy } from './types'

export function findLocalStudy(
  query: string,
  studies: WordStudy[],
  entries: StrongEntry[],
  testament?: Testament,
): { study?: WordStudy; entry?: StrongEntry } {
  const normalized = normalize(query)
  const study = studies.find((item) =>
    (!testament || item.testament === testament) &&
    [item.word, item.originalWord, item.transliteration, item.strongsNumber]
      .some((field) => normalize(field) === normalized),
  )
  if (study) return { study }

  const entry = entries.find((item) =>
    (!testament || item.testament === testament) &&
    [item.code, item.lemma, item.transliteration, item.linkedStudy ?? '']
      .some((field) => normalize(field) === normalized),
  )
  return entry ? { entry } : {}
}

export function createLexiconFallbackStudy(entry: StrongEntry): WordStudy {
  return {
    id: `lexicon-${entry.code.toLowerCase()}-${Date.now()}`,
    word: entry.linkedStudy ?? entry.transliteration,
    testament: entry.testament,
    originalWord: entry.lemma,
    transliteration: entry.transliteration,
    strongsNumber: entry.code,
    literalMeaning: entry.definition,
    thenMeaning: 'A short dictionary gloss is available offline. It does not establish the meaning of this word in any particular passage.',
    nowMeaning: 'No modern usage comparison is available for this lexicon-only entry.',
    historicalBackground: 'No historical-background entry is bundled for this lemma. Consult primary texts and specialist reference works.',
    culturalContext: 'No culture-specific interpretation is bundled for this lemma.',
    legalDimension: 'No legal-context entry is bundled for this lemma.',
    theologicalWeight: 'No theological synthesis is bundled for this lemma.',
    keyScriptures: [],
    closingInsight: 'Use this entry as a lexical starting point, not as a complete word study.',
    rootLemma: entry.derivation,
    morphologicalFamilyTable: `${entry.lemma} (${entry.partOfSpeech}) · ${entry.derivation}`,
    translationDisconnect: 'A dictionary entry cannot capture every contextual use. Compare the lemma’s syntax, genre, and wider usage in the passage.',
    userNotes: '',
    userTags: [],
    isFavorite: false,
    updatedAt: Date.now(),
    provenance: 'lexicon-fallback',
  }
}

function normalize(value: string): string {
  return value.normalize('NFKC').trim().toLocaleLowerCase()
}
