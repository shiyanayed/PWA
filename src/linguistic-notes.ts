import type { Testament } from './types'

export type LinguisticNoteKind =
  | 'Euphemistic usage'
  | 'Rare lexical sense'
  | 'Context-dependent polysemy'
  | 'Translation range'

export interface LinguisticNote {
  code: string
  testament: Testament
  lemma: string
  transliteration: string
  kind: LinguisticNoteKind
  primarySense: string
  contextualSense: string
  explanation: string
  references: string[]
  lexiconUrl: string
  lexiconLabel: string
}

export const linguisticNotes: LinguisticNote[] = [
  {
    code: 'H1288',
    testament: 'Hebrew',
    lemma: 'בָּרַךְ',
    transliteration: 'bārak',
    kind: 'Euphemistic usage',
    primarySense: 'bless; kneel',
    contextualSense: '“curse” in a few formulaic passages',
    explanation: 'Strong’s lexicon lists “curse” as a euphemistic use. In Job and the Naboth narrative, context supports this exceptional reading; it is not a general opposite meaning for every occurrence of the verb.',
    references: ['Job 1:5, 11', 'Job 2:5, 9', '1 Kings 21:10, 13'],
    lexiconUrl: 'https://biblehub.com/hebrew/1288.htm',
    lexiconLabel: 'Hebrew lexicon · H1288',
  },
  {
    code: 'H2617',
    testament: 'Hebrew',
    lemma: 'חֶסֶד',
    transliteration: 'ḥéṣed',
    kind: 'Rare lexical sense',
    primarySense: 'kindness; loyalty; mercy',
    contextualSense: 'rarely “reproach” or “reproof”',
    explanation: 'The lexicon records a rare contrasting sense alongside the common kindness/loyalty sense. Treat these passages as an unusual lexical usage, not as evidence that the ordinary covenantal sense means its own opposite.',
    references: ['Leviticus 20:17', 'Proverbs 14:34'],
    lexiconUrl: 'https://biblehub.com/hebrew/2617.htm',
    lexiconLabel: 'Hebrew lexicon · H2617',
  },
  {
    code: 'G1242',
    testament: 'Greek',
    lemma: 'διαθήκη',
    transliteration: 'diathēkē',
    kind: 'Translation range',
    primarySense: 'covenant; agreement',
    contextualSense: 'testament; will in some legal contexts',
    explanation: 'English translations vary with context. Hebrews 9:16–17 uses language commonly rendered “will” or “testament,” while many other New Testament passages use “covenant.” Neither gloss should be applied mechanically to every occurrence.',
    references: ['Galatians 3:15', 'Hebrews 9:16–17'],
    lexiconUrl: 'https://biblehub.com/greek/1242.htm',
    lexiconLabel: 'Greek lexicon · G1242',
  },
  {
    code: 'G2205',
    testament: 'Greek',
    lemma: 'ζῆλος',
    transliteration: 'zēlos',
    kind: 'Context-dependent polysemy',
    primarySense: 'zeal; ardor',
    contextualSense: 'jealousy; rivalry in negative contexts',
    explanation: 'The same lexeme can describe commendable ardor or destructive rivalry. The moral evaluation comes from the clause and context; these are related contextual senses, not literal opposites.',
    references: ['2 Corinthians 7:7', 'James 3:14, 16'],
    lexiconUrl: 'https://biblehub.com/greek/2205.htm',
    lexiconLabel: 'Greek lexicon · G2205',
  },
  {
    code: 'G5331',
    testament: 'Greek',
    lemma: 'φαρμακεία',
    transliteration: 'pharmakeia',
    kind: 'Context-dependent polysemy',
    primarySense: 'sorcery; magical practice in New Testament usage',
    contextualSense: 'drug use or poisoning in wider Greek usage',
    explanation: 'The word family is related to drugs and potions, but that etymological connection does not make “medicine” the meaning in every New Testament passage. Lexicons distinguish drug-related senses from the New Testament contexts commonly translated “sorcery”; Revelation 9:21 also has a textual/lexical variant and should not be cited as an uncomplicated occurrence of this lemma.',
    references: ['Galatians 5:20', 'Revelation 9:21 (textual variant)', 'Revelation 18:23'],
    lexiconUrl: 'https://biblehub.com/greek/5331.htm',
    lexiconLabel: 'Greek lexicon · G5331',
  },
]

export function findLinguisticNote(code: string): LinguisticNote | undefined {
  const normalizedCode = code.trim().toUpperCase()
  return linguisticNotes.find((note) => note.code === normalizedCode)
}
