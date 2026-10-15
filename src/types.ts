export type Testament = 'Greek' | 'Hebrew'

export interface WordStudy {
  id: string
  word: string
  testament: Testament
  originalWord: string
  transliteration: string
  strongsNumber: string
  literalMeaning: string
  thenMeaning: string
  nowMeaning: string
  historicalBackground: string
  culturalContext: string
  legalDimension: string
  theologicalWeight: string
  keyScriptures: string[]
  closingInsight: string
  rootLemma: string
  morphologicalFamilyTable: string
  translationDisconnect: string
  searchGroundingSources?: string[]
  provenance?: 'curated' | 'ai-generated' | 'lexicon-fallback'
  userNotes: string
  userTags: string[]
  isFavorite: boolean
  updatedAt: number
}

export interface StrongEntry {
  code: string
  testament: Testament
  lemma: string
  transliteration: string
  pronunciation: string
  definition: string
  derivation: string
  partOfSpeech: string
  kjvCount: number
  linkedStudy?: string
}

export interface SourceCitation {
  label: string
  url: string
}

export interface ApologeticsDossier {
  id: string
  title: string
  question: string
  category: string
  summary: string
  position: string
  evidence: string[]
  caveat: string
  sources: SourceCitation[]
}

export interface AuditResult {
  url: string
  domain: string
  score: number
  tier: 1 | 2 | 3 | 4 | 5 | 0
  label: string
  accepted: boolean
}

export type AppTab = 'Study Hub' | 'Apologetics' | 'Lexicon' | 'Linguistic Notes' | 'Patristic Archive' | 'Notebook' | 'Settings'
export type ThemeMode = 'midnight' | 'scholar'
