import { useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  ArrowDownRight, ArrowLeft, ArrowRight, ArrowUpRight, BookMarked, BookOpen,
  Check, ChevronRight, CircleHelp, Clipboard, FileText, Heart, Languages,
  Library, LoaderCircle, Menu, MessageCircle, NotebookPen, Plus, Search, Send,
  Settings2, ShieldCheck, Share2, Sparkles, Star, Trash2, Upload, Volume2, X,
} from 'lucide-react'
import { db, initializeKnowledgeBase } from './db'
import { askPhilologist, canUseOfflineFallback, generateStudy, type AiProvider, type ChatTurn } from './gemini'
import { auditSources } from './trust'
import { patristicWitnesses, type PatristicEpoch } from './patristic'
import { createLexiconFallbackStudy, findLocalStudy } from './offline'
import { parseLexiconImport } from './lexicon-import'
import { findLinguisticNote, linguisticNotes, type LinguisticNote } from './linguistic-notes'
import type { AppTab, ApologeticsDossier, StrongEntry, Testament, ThemeMode, WordStudy } from './types'

const tabs: Array<{ name: AppTab; icon: typeof BookOpen }> = [
  { name: 'Study Hub', icon: BookOpen },
  { name: 'Apologetics', icon: CircleHelp },
  { name: 'Lexicon', icon: Library },
  { name: 'Linguistic Notes', icon: Languages },
  { name: 'Patristic Archive', icon: BookMarked },
  { name: 'Notebook', icon: NotebookPen },
  { name: 'Settings', icon: Settings2 },
]

const tabDescriptions: Record<AppTab, string> = {
  'Study Hub': 'Explore biblical language in its historical world.',
  Apologetics: 'Evidence-led guides to questions of faith and history.',
  Lexicon: 'Browse a curated Greek and Hebrew reference shelf.',
  'Linguistic Notes': 'Explore source-linked semantic ranges and translation decisions.',
  'Patristic Archive': 'Read early Christian witnesses in cited historical translations.',
  Notebook: 'Your saved studies, notes, and working library.',
  Settings: 'Personalize your workspace and AI study tools.',
}

function App() {
  const [activeTab, setActiveTab] = useState<AppTab>('Study Hub')
  const [studies, setStudies] = useState<WordStudy[]>([])
  const [dossiers, setDossiers] = useState<ApologeticsDossier[]>([])
  const [lexicon, setLexicon] = useState<StrongEntry[]>([])
  const [selectedStudyId, setSelectedStudyId] = useState('')
  const [selectedDossierId, setSelectedDossierId] = useState('')
  const [query, setQuery] = useState('')
  const [testament, setTestament] = useState<Testament>('Greek')
  const [lexiconQuery, setLexiconQuery] = useState('')
  const [lexiconFilter, setLexiconFilter] = useState<'All' | 'Greek' | 'Hebrew'>('All')
  const [linguisticQuery, setLinguisticQuery] = useState('')
  const [linguisticFilter, setLinguisticFilter] = useState<'All' | 'Greek' | 'Hebrew'>('All')
  const [provider, setProvider] = useState<AiProvider>('gemini')
  const [geminiApiKey, setGeminiApiKey] = useState('')
  const [groqApiKey, setGroqApiKey] = useState('')
  const [theme, setTheme] = useState<ThemeMode>('midnight')
  const [useSearchGrounding, setUseSearchGrounding] = useState(true)
  const [strictVerification, setStrictVerification] = useState(false)
  const [isReady, setIsReady] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [chatOpen, setChatOpen] = useState(false)
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [showMethodology, setShowMethodology] = useState(false)
  const [notebookTagFilter, setNotebookTagFilter] = useState('')

  const refresh = async () => {
    const [nextStudies, nextDossiers, nextLexicon] = await Promise.all([
      db.studies.orderBy('updatedAt').reverse().toArray(),
      db.dossiers.orderBy('title').toArray(),
      db.lexicon.orderBy('code').toArray(),
    ])
    setStudies(nextStudies)
    setDossiers(nextDossiers)
    setLexicon(nextLexicon)
    setSelectedStudyId((current) => current || nextStudies[0]?.id || '')
    setSelectedDossierId((current) => current || nextDossiers[0]?.id || '')
  }

  useEffect(() => {
    let cancelled = false
    const start = async () => {
      try {
        await initializeKnowledgeBase()
        const [savedProvider, savedTheme, savedGrounding, savedStrict, savedGeminiApiKey, savedGroqApiKey, seenOnboarding] = await Promise.all([
          db.settings.get('aiProvider'),
          db.settings.get('theme'),
          db.settings.get('useSearchGrounding'),
          db.settings.get('strictVerification'),
          db.settings.get('geminiApiKey'),
          db.settings.get('groqApiKey'),
          db.settings.get('onboardingSeen'),
        ])
        if (cancelled) return
        const value = isAiProvider(savedProvider?.value) ? savedProvider.value : 'gemini'
        const selectedTheme = savedTheme?.value === 'scholar' ? 'scholar' : 'midnight'
        setProvider(value)
        setGeminiApiKey(savedGeminiApiKey?.value ?? '')
        setGroqApiKey(savedGroqApiKey?.value ?? '')
        setTheme(selectedTheme)
        setUseSearchGrounding(savedGrounding?.value !== 'false' && value === 'gemini')
        setStrictVerification(savedStrict?.value === 'true')
        setShowOnboarding(seenOnboarding?.value !== 'true')
        await refresh()
        if (!cancelled) setIsReady(true)
      } catch (cause) {
        if (!cancelled) setError(`Could not open your local study library: ${errorMessage(cause)}`)
      }
    }
    void start()
    return () => { cancelled = true }
  }, [])

  const selectedStudy = studies.find((study) => study.id === selectedStudyId)
  const selectedDossier = dossiers.find((dossier) => dossier.id === selectedDossierId)
  const favorites = studies.filter((study) => study.isFavorite)
  const notebookTags = [...new Set(favorites.flatMap((study) => study.userTags))].sort((a, b) => a.localeCompare(b))
  const filteredFavorites = notebookTagFilter
    ? favorites.filter((study) => study.userTags.includes(notebookTagFilter))
    : favorites
  const filteredLexicon = useMemo(() => {
    const term = lexiconQuery.trim().toLowerCase()
    return lexicon.filter((entry) =>
      (lexiconFilter === 'All' || entry.testament === lexiconFilter) &&
      [entry.code, entry.lemma, entry.transliteration, entry.definition, entry.linkedStudy ?? '']
        .some((field) => !term || field.toLowerCase().includes(term)),
    )
  }, [lexicon, lexiconQuery, lexiconFilter])
  const filteredLinguisticNotes = useMemo(() => {
    const term = linguisticQuery.trim().toLocaleLowerCase()
    return linguisticNotes.filter((note) =>
      (linguisticFilter === 'All' || note.testament === linguisticFilter) &&
      [note.code, note.lemma, note.transliteration, note.kind, note.primarySense, note.contextualSense, note.explanation, ...note.references]
        .some((field) => field.toLocaleLowerCase().includes(term)),
    )
  }, [linguisticQuery, linguisticFilter])

  async function createStudy(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const term = query.trim()
    if (!term) return
    setError('')
    setNotice('')
    const strongsPrefix = /^([gh])\d+/i.exec(term)?.[1]?.toUpperCase()
    const selectedTestament: Testament = strongsPrefix === 'H' ? 'Hebrew' : strongsPrefix === 'G' ? 'Greek' : testament
    const local = findLocalStudy(term, studies, lexicon, selectedTestament)
    if (local.study) {
      setSelectedStudyId(local.study.id)
      setQuery('')
      setNotice(`Opened the saved local study for “${local.study.word}”.`)
      return
    }
    setIsGenerating(true)
    try {
      let result: WordStudy
      try {
        result = await generateStudy(provider, term, { testament: selectedTestament, useSearchGrounding, strictVerification, geminiApiKey, groqApiKey })
      } catch (cause) {
        if (!canUseOfflineFallback(cause)) throw cause
        if (!local.entry) {
          throw new Error('Gemini is temporarily unavailable after trying the configured models. No matching bundled lexicon entry is available offline.')
        }
        result = createLexiconFallbackStudy(local.entry)
        await db.studies.put(result)
        await refresh()
        setSelectedStudyId(result.id)
        setQuery('')
        setNotice(`Gemini models are temporarily unavailable. Showing the bundled lexicon-only entry for ${local.entry.code}; it is not a complete word study or a verified historical interpretation.`)
        return
      }
      await db.studies.put(result)
      await refresh()
      setSelectedStudyId(result.id)
      setQuery('')
      setActiveTab('Study Hub')
      setNotice(`Study created for “${result.word}”.`)
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setIsGenerating(false)
    }
  }

  async function toggleFavorite(study: WordStudy) {
    const updated = { ...study, isFavorite: !study.isFavorite, updatedAt: Date.now() }
    await db.studies.put(updated)
    await refresh()
    setNotice(updated.isFavorite ? 'Added to your notebook.' : 'Removed from your notebook.')
  }

  async function saveNotes(study: WordStudy, userNotes: string) {
    setIsSaving(true)
    setError('')
    try {
      await db.studies.put({ ...study, userNotes, updatedAt: Date.now() })
      await refresh()
      setNotice('Notes saved to this device.')
    } catch (cause) {
      setError(`Could not save notes: ${errorMessage(cause)}`)
    } finally {
      setIsSaving(false)
    }
  }

  async function saveTags(study: WordStudy, userTags: string[]) {
    setError('')
    try {
      await db.studies.put({ ...study, userTags, updatedAt: Date.now() })
      await refresh()
      setNotice('Study tags saved.')
    } catch (cause) {
      setError(`Could not save tags: ${errorMessage(cause)}`)
    }
  }

  async function deleteGeneratedStudy(study: WordStudy) {
    if (study.provenance === 'curated') return
    if (!window.confirm(`Delete the generated local study for “${study.word}”? This cannot be undone.`)) return
    try {
      await db.studies.delete(study.id)
      setSelectedStudyId('')
      await refresh()
      setNotice(`Deleted the local study for “${study.word}”.`)
    } catch (cause) {
      setError(`Could not delete the study: ${errorMessage(cause)}`)
    }
  }

  async function importLexiconFile(file: File) {
    if (file.size > 12_000_000) {
      setError('Lexicon JSON must be smaller than 12 MB.')
      return
    }
    try {
      const entries = parseLexiconImport(await file.text())
      await db.lexicon.bulkPut(entries)
      await refresh()
      setNotice(`Imported ${entries.length.toLocaleString()} lexicon entries. Review the data source and its license before importing.`)
    } catch (cause) {
      setError(errorMessage(cause))
    }
  }

  async function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    try {
      await Promise.all([
        db.settings.put({ key: 'aiProvider', value: provider }),
        db.settings.put({ key: 'theme', value: theme }),
        db.settings.put({ key: 'useSearchGrounding', value: String(useSearchGrounding) }),
        db.settings.put({ key: 'strictVerification', value: String(strictVerification) }),
        geminiApiKey.trim()
          ? db.settings.put({ key: 'geminiApiKey', value: geminiApiKey.trim() })
          : db.settings.delete('geminiApiKey'),
        groqApiKey.trim()
          ? db.settings.put({ key: 'groqApiKey', value: groqApiKey.trim() })
          : db.settings.delete('groqApiKey'),
      ])
      setGeminiApiKey(geminiApiKey.trim())
      setGroqApiKey(groqApiKey.trim())
      const personalProviders = [
        geminiApiKey.trim() ? 'Gemini' : '',
        groqApiKey.trim() ? 'Groq' : '',
      ].filter(Boolean)
      setNotice(personalProviders.length
        ? `Preferences and ${personalProviders.join(' and ')} key${personalProviders.length === 1 ? '' : 's'} saved in this browser. Requests for those providers go directly from this browser to the provider.`
        : 'Preferences saved on this device. AI requests use the Vercel proxy.')
    } catch (cause) {
      setError(`Could not save settings: ${errorMessage(cause)}`)
    }
  }

  async function finishOnboarding() {
    try {
      await db.settings.put({ key: 'onboardingSeen', value: 'true' })
      setShowOnboarding(false)
    } catch (cause) {
      setError(`Could not save onboarding preference: ${errorMessage(cause)}`)
    }
  }

  const changeTab = (tab: AppTab) => {
    setActiveTab(tab)
    setMobileNavOpen(false)
    setError('')
  }

  if (!isReady) {
    return (
      <main className="boot-screen">
        {error ? <div className="boot-error"><ShieldCheck size={24} /><h1>Library unavailable</h1><p>{error}</p></div> : <><div className="brand-mark"><BookOpen size={23} /></div><LoaderCircle className="spin" size={22} /><span>Opening your study library…</span></>}
      </main>
    )
  }

  return (
    <div className={`app-shell theme-${theme}`}>
      {mobileNavOpen && <button className="nav-scrim" onClick={() => setMobileNavOpen(false)} aria-label="Close navigation" />}
      <aside className={`sidebar ${mobileNavOpen ? 'sidebar-open' : ''}`}>
        <div className="brand">
          <div className="brand-mark"><BookOpen size={22} strokeWidth={1.8} /></div>
          <div className="brand-copy"><strong>Word Context</strong><span>THE ANCIENT TEXT, REOPENED</span></div>
          <button className="icon-button mobile-close" onClick={() => setMobileNavOpen(false)} aria-label="Close menu"><X size={18} /></button>
        </div>
        <div className="workspace-label">WORKSPACE</div>
        <nav className="side-nav" aria-label="Main navigation">
          {tabs.map(({ name, icon: Icon }) => (
            <button key={name} className={`nav-item ${activeTab === name ? 'active' : ''}`} onClick={() => changeTab(name)}>
              <Icon size={18} strokeWidth={1.8} /><span>{name}</span>{name === 'Notebook' && favorites.length > 0 && <small>{favorites.length}</small>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="offline-status"><span className="status-dot" /><span>Available offline</span><Check size={14} /></div>
          <div className="sidebar-footnote"><span>Independent study, responsibly sourced.</span><a href="https://www.sbl-site.org/" target="_blank" rel="noreferrer">Research standards <ArrowUpRight size={12} /></a></div>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <button className="icon-button mobile-menu" onClick={() => setMobileNavOpen(true)} aria-label="Open navigation"><Menu size={20} /></button>
          <div className="breadcrumbs"><span>WORD CONTEXT</span><ChevronRight size={13} /><strong>{activeTab.toUpperCase()}</strong></div>
          <div className="topbar-right"><button className="ask-ai-button" onClick={() => setChatOpen(true)}><MessageCircle size={15} /> Ask AI</button><span className="local-label"><span className="status-dot" /> LOCAL LIBRARY</span><button className="avatar" onClick={() => changeTab('Settings')} aria-label="Open settings">WC</button></div>
        </header>

        <div className="content-area">
          <div className="page-heading"><div><div className="eyebrow">A HISTORICAL LENS ON SCRIPTURE</div><h1>{activeTab}</h1><p>{tabDescriptions[activeTab]}</p></div>
            {activeTab !== 'Settings' && <button className="button button-quiet" onClick={() => changeTab('Settings')}><Settings2 size={15} /> Preferences</button>}
          </div>

          {(error || notice) && <div className={`inline-alert ${error ? 'alert-error' : 'alert-success'}`} role={error ? 'alert' : 'status'}>{error || notice}<button className="icon-button" onClick={() => { setError(''); setNotice('') }} aria-label="Dismiss"><X size={15} /></button></div>}

          {activeTab === 'Study Hub' && (
            <section className="page-content">
              <div className="hero-panel">
                <div className="hero-copy">
                  <div className="hero-kicker"><Sparkles size={14} /> HISTORICAL WORD STUDY</div>
                  <h2>Words carry worlds.<br /><em>Let’s recover them.</em></h2>
                  <p>Look beyond a modern translation. Explore the language, social world, and historical setting behind a biblical word.</p>
                  <label className="testament-select">Testament
                    <select value={testament} onChange={(event) => setTestament(event.target.value as Testament)} aria-label="Select testament and language">
                      <option value="Hebrew">Old Testament · Hebrew</option>
                      <option value="Greek">New Testament · Greek</option>
                    </select>
                  </label>
                  <form className="study-search" onSubmit={(event) => void createStudy(event)}>
                    <Search size={18} />
                    <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Enter a word or Strong’s number…" aria-label="Word or Strong's number" />
                    <button type="submit" disabled={isGenerating || !query.trim()}>{isGenerating ? <LoaderCircle size={16} className="spin" /> : <><span>Explore</span><ArrowRight size={15} /></>}</button>
                  </form>
                  <div className="search-caption">AI-assisted study · Provider credentials are protected by the server</div>
                </div>
                <div className="hero-art" aria-hidden="true"><span className="orbit orbit-one" /><span className="orbit orbit-two" /><div className="greek-glyph">λόγος</div><div className="art-note note-top">λόγος <span>G3056</span></div><div className="art-note note-bottom"><span>THE LIVING TEXT</span><ArrowDownRight size={15} /></div></div>
              </div>
              <div className="stat-row">
                <StatCard label="WORD STUDIES" value={studies.length.toString().padStart(2, '0')} icon={<BookMarked size={17} />} note="In your library" />
                <StatCard label="GREEK & HEBREW" value={lexicon.length.toString().padStart(2, '0')} icon={<Library size={17} />} note="Lexicon entries" />
                <StatCard label="SAVED NOTES" value={favorites.length.toString().padStart(2, '0')} icon={<Heart size={17} />} note="In your notebook" />
                <StatCard label="FOR YOUR STUDY" value={dossiers.length.toString().padStart(2, '0')} icon={<FileText size={17} />} note="Research dossiers" />
              </div>
              <div className="section-heading"><div><div className="eyebrow">START EXPLORING</div><h2>From the study shelf</h2></div><button className="text-button" onClick={() => changeTab('Notebook')}>Your notebook <ArrowRight size={14} /></button></div>
              <div className="study-grid">
                {studies.slice(0, 4).map((study, index) => <StudyCard key={study.id} study={study} index={index} onOpen={() => setSelectedStudyId(study.id)} onFavorite={() => void toggleFavorite(study)} />)}
              </div>
              {selectedStudy && <StudyReader key={selectedStudy.id} study={selectedStudy} onBack={() => setSelectedStudyId('')} onFavorite={() => void toggleFavorite(selectedStudy)} onSaveNotes={(notes) => void saveNotes(selectedStudy, notes)} onSaveTags={(tags) => void saveTags(selectedStudy, tags)} onDelete={() => void deleteGeneratedStudy(selectedStudy)} onAskAi={() => setChatOpen(true)} isSaving={isSaving} />}
              <div className="bottom-callout"><div className="callout-icon"><ShieldCheck size={18} /></div><div><strong>Context before conclusion.</strong><span>Our source ratings assess publisher domains, not the truth of individual claims. Always check the cited passage.</span></div><button className="text-button" onClick={() => setShowMethodology(true)}>About our approach <ArrowRight size={14} /></button></div>
            </section>
          )}

          {activeTab === 'Apologetics' && (
            <section className="page-content">
              <div className="split-heading"><div><div className="eyebrow">QUESTIONS, EVIDENCE, CAVEATS</div><h2>Careful answers begin with better questions.</h2><p>Short research dossiers that distinguish historical evidence from interpretation.</p></div><div className="dossier-count"><strong>{dossiers.length.toString().padStart(2, '0')}</strong><span>RESEARCH DOSSIERS</span></div></div>
              <div className="dossier-layout">
                <div className="dossier-list">{dossiers.map((dossier) => <button key={dossier.id} className={`dossier-item ${dossier.id === selectedDossier?.id ? 'selected' : ''}`} onClick={() => setSelectedDossierId(dossier.id)}><span className="dossier-category">{dossier.category}</span><strong>{dossier.title}</strong><span className="dossier-question">{dossier.question}</span><ChevronRight size={17} /></button>)}</div>
                {selectedDossier && <DossierReader dossier={selectedDossier} />}
              </div>
            </section>
          )}

          {activeTab === 'Lexicon' && (
            <section className="page-content">
              <div className="lexicon-toolbar"><div><div className="eyebrow">GREEK & HEBREW REFERENCE</div><h2>Lexicon shelf</h2><p>Curated entries to support contextual reading—not a substitute for specialist lexica.</p></div><label className="lexicon-search"><Search size={17} /><input value={lexiconQuery} onChange={(event) => setLexiconQuery(event.target.value)} placeholder="Search lemma, gloss, or number…" /><span>{filteredLexicon.length}</span></label></div>
              <div className="lexicon-tools"><div className="lexicon-filters" aria-label="Filter by testament">{(['All', 'Greek', 'Hebrew'] as const).map((filter) => <button key={filter} className={lexiconFilter === filter ? 'selected' : ''} onClick={() => setLexiconFilter(filter)}>{filter}{filter !== 'All' && <small>{lexicon.filter((entry) => entry.testament === filter).length}</small>}</button>)}</div><label className="button button-quiet lexicon-import"><Upload size={14} /> Import licensed JSON<input type="file" accept="application/json,.json" onChange={(event) => { const file = event.currentTarget.files?.[0]; if (file) void importLexiconFile(file); event.currentTarget.value = '' }} /></label></div>
              <div className="lexicon-table-wrap"><table className="lexicon-table"><thead><tr><th>STRONG’S</th><th>LEMMA / TRANSLITERATION</th><th>GLOSS</th><th>PART OF SPEECH</th><th>NT / OT USE</th><th /></tr></thead><tbody>{filteredLexicon.map((entry) => {
                const linkedStudy = studies.find((study) => study.strongsNumber === entry.code)
                return <tr key={entry.code} onClick={() => { if (linkedStudy) { setSelectedStudyId(linkedStudy.id); setActiveTab('Study Hub') } }} className={linkedStudy ? 'clickable-row' : ''}>
                  <td><span className={`testament-code ${entry.testament.toLowerCase()}`}>{entry.code}</span></td><td><strong className="lemma">{entry.lemma}</strong><span className="transliteration">{entry.transliteration} · {entry.pronunciation}</span></td><td className="definition-cell">{entry.definition}<span className="derivation">{entry.derivation}</span></td><td>{entry.partOfSpeech}</td><td>{entry.kjvCount.toLocaleString()}</td><td>{linkedStudy && <ArrowUpRight size={15} />}</td>
                </tr>
              })}</tbody></table>{filteredLexicon.length === 0 && <EmptyState title="No entries found" description="Try a different spelling, gloss, or Strong’s number." />}</div>
            </section>
          )}

          {activeTab === 'Linguistic Notes' && (
            <section className="page-content">
              <div className="lexicon-toolbar">
                <div><div className="eyebrow">SEMANTICS & TRANSLATION</div><h2>Language notes</h2><p>Source-linked examples of euphemism, rare senses, and context-dependent translation.</p></div>
                <label className="lexicon-search"><Search size={17} /><input value={linguisticQuery} onChange={(event) => setLinguisticQuery(event.target.value)} placeholder="Search lemma, Strong’s number, or passage…" aria-label="Search linguistic notes" /><span>{filteredLinguisticNotes.length}</span></label>
              </div>
              <div className="lexicon-filters" aria-label="Filter linguistic notes by testament">{(['All', 'Greek', 'Hebrew'] as const).map((filter) => <button key={filter} className={linguisticFilter === filter ? 'selected' : ''} onClick={() => setLinguisticFilter(filter)}>{filter}</button>)}</div>
              <div className="language-notes-caveat"><ShieldCheck size={17} /><p>These are contextual language notes, not a list of proven contronyms. A lexicon entry or English gloss does not settle the meaning of a particular passage; check the cited wording and its context.</p></div>
              <div className="language-notes-grid">{filteredLinguisticNotes.map((note) => {
                const matchingStudy = studies.find((study) => study.strongsNumber.toUpperCase() === note.code)
                return <LinguisticNoteCard key={note.code} note={note} matchingStudy={matchingStudy} onOpenStudy={() => {
                  if (!matchingStudy) return
                  setSelectedStudyId(matchingStudy.id)
                  setActiveTab('Study Hub')
                }} />
              })}{filteredLinguisticNotes.length === 0 && <EmptyState title="No language notes found" description="Try another lemma, reference, or Strong’s number." />}</div>
            </section>
          )}

          {activeTab === 'Patristic Archive' && <PatristicArchive />}

          {activeTab === 'Notebook' && (
            <section className="page-content">
              <div className="notebook-intro"><div className="notebook-emblem"><NotebookPen size={21} /></div><div><div className="eyebrow">YOUR PERSONAL RESEARCH SPACE</div><h2>A place for what you’re learning.</h2><p>Favorite a study to keep it close. Notes are saved locally on this device.</p></div></div>
              {notebookTags.length > 0 && <div className="tag-filter" aria-label="Filter notebook by tag"><button className={!notebookTagFilter ? 'selected' : ''} onClick={() => setNotebookTagFilter('')}>All saved</button>{notebookTags.map((tag) => <button key={tag} className={notebookTagFilter === tag ? 'selected' : ''} onClick={() => setNotebookTagFilter(tag)}>{tag}</button>)}</div>}
              {favorites.length ? filteredFavorites.length ? <div className="study-grid notebook-grid">{filteredFavorites.map((study, index) => <StudyCard key={study.id} study={study} index={index} onOpen={() => { setSelectedStudyId(study.id); setActiveTab('Study Hub') }} onFavorite={() => void toggleFavorite(study)} />)}</div> : <EmptyState title="No studies with this tag" description="Choose another tag or add this tag to a saved study." /> : <EmptyState title="Your notebook is ready" description="Save a word study with the bookmark button to find it here." action={<button className="button button-primary" onClick={() => changeTab('Study Hub')}><Plus size={15} /> Explore a word</button>} />}
              <div className="notes-list"><div className="section-heading"><div><div className="eyebrow">RECENTLY ANNOTATED</div><h2>Your study notes</h2></div></div>{studies.filter((study) => study.userNotes.trim()).length ? studies.filter((study) => study.userNotes.trim()).map((study) => <button key={study.id} className="note-item" onClick={() => { setSelectedStudyId(study.id); setActiveTab('Study Hub') }}><span className="note-word">{study.word}</span><span>{study.userNotes}</span><ArrowUpRight size={15} /></button>) : <p className="muted-note">Your saved study notes will appear here.</p>}</div>
            </section>
          )}

          {activeTab === 'Settings' && (
            <section className="page-content settings-page">
              <div className="settings-intro"><div className="eyebrow">YOUR WORKSPACE, YOUR DEVICE</div><h2>Settings</h2><p>Word Context keeps your library and preferences in this browser.</p></div>
              <form onSubmit={(event) => void saveSettings(event)} className="settings-card">
                <div className="settings-card-heading"><div className="settings-icon"><Sparkles size={18} /></div><div><h3>AI word studies & chat</h3><p>Choose a provider configured on the server, or use a personal Gemini or Groq key in this browser.</p></div></div>
                <label className="field-label" htmlFor="ai-provider">AI provider</label>
                <select id="ai-provider" className="text-input provider-select" value={provider} onChange={(event) => {
                  const nextProvider = event.target.value as AiProvider
                  setProvider(nextProvider)
                  if (nextProvider !== 'gemini') setUseSearchGrounding(false)
                }}>
                  <option value="gemini">Google Gemini</option><option value="claude">Anthropic Claude</option><option value="groq">Groq</option><option value="grok">xAI Grok</option>
                </select>
                {provider === 'gemini' && <div className="personal-key-field">
                  <label className="field-label" htmlFor="gemini-api-key">Your Gemini API key (optional)</label>
                  <input id="gemini-api-key" className="text-input" type="password" autoComplete="off" spellCheck={false} value={geminiApiKey} onChange={(event) => setGeminiApiKey(event.target.value)} placeholder="Paste your Gemini API key" />
                  <p className="field-help">When saved, Gemini requests go directly from this browser to Google and bypass the Vercel proxy. The key is stored in this browser’s IndexedDB and is accessible to anyone using this browser, including browser scripts and extensions. Don’t use this on a shared or untrusted device. Clear the field and save to remove it and return to the Vercel proxy.</p>
                </div>}
                {provider === 'groq' && <div className="personal-key-field">
                  <label className="field-label" htmlFor="groq-api-key">Your Groq API key (optional)</label>
                  <input id="groq-api-key" className="text-input" type="password" autoComplete="off" spellCheck={false} value={groqApiKey} onChange={(event) => setGroqApiKey(event.target.value)} placeholder="Paste your Groq API key" />
                  <p className="field-help">When saved, Groq requests go directly from this browser to Groq and bypass the Vercel proxy. The key is stored in this browser’s IndexedDB and is accessible to anyone using this browser, including browser scripts and extensions. Don’t use this on a shared or untrusted device. Clear the field and save to remove it and return to the Vercel proxy.</p>
                </div>}
                <p className="field-help">Without a personal key for the selected provider, its credentials must be configured as server environment variables in Vercel.</p>
                <div className="verification-options">
                  <label><input type="checkbox" checked={useSearchGrounding} disabled={provider !== 'gemini'} onChange={(event) => setUseSearchGrounding(event.target.checked)} /><span><strong>Google Search grounding</strong><small>Attach search grounding for Gemini studies. Other providers do not expose this integration.</small></span></label>
                  <label><input type="checkbox" checked={strictVerification} onChange={(event) => setStrictVerification(event.target.checked)} /><span><strong>Strict source filter</strong><small>Keep citations from registered Tier 1–3 domains; generation fails if verified-domain sources do not average 90/100.</small></span></label>
                </div>
                <div className="settings-divider" />
                <div className="settings-card-heading"><div className="settings-icon"><Star size={18} /></div><div><h3>Reading appearance</h3><p>Choose a comfortable palette for your study sessions.</p></div></div>
                <div className="theme-options"><button type="button" className={`theme-option ${theme === 'midnight' ? 'chosen' : ''}`} onClick={() => setTheme('midnight')}><span className="theme-swatch midnight-swatch" /><span><strong>Midnight archive</strong><small>Dark ink & warm parchment</small></span>{theme === 'midnight' && <Check size={16} />}</button><button type="button" className={`theme-option ${theme === 'scholar' ? 'chosen' : ''}`} onClick={() => setTheme('scholar')}><span className="theme-swatch scholar-swatch" /><span><strong>Scholar’s desk</strong><small>Warm paper & deep ink</small></span>{theme === 'scholar' && <Check size={16} />}</button></div>
                <div className="settings-actions"><span><ShieldCheck size={14} /> Settings remain on this device</span><button type="submit" className="button button-primary"><Check size={15} /> Save settings</button></div>
              </form>
              <div className="privacy-note"><ShieldCheck size={18} /><div><strong>Offline by design</strong><span>Your library is stored locally. A network connection is used for AI requests and external source links.</span></div></div>
              <div className="methodology-short"><div><div className="eyebrow">RESEARCH SAFEGUARDS</div><strong>Methodology and limitations</strong><p>Source-domain ratings are not a fact-check. AI-generated studies and quotations must be independently verified.</p></div><button className="button button-quiet" onClick={() => setShowMethodology(true)}>Read disclosure <ArrowRight size={14} /></button></div>
            </section>
          )}
          <footer className="page-footer"><span>WORD CONTEXT <span className="footer-dot">·</span> HISTORICAL BIBLICAL EXEGESIS</span><span>Study with curiosity. Cite with care.</span></footer>
        </div>
      </main>
      {chatOpen && <ChatDialog provider={provider} personalKeys={{ gemini: geminiApiKey, groq: groqApiKey }} studyContext={selectedStudy ? formatStudyContext(selectedStudy) : undefined} onClose={() => setChatOpen(false)} />}
      {showOnboarding && <OnboardingDialog onContinue={() => void finishOnboarding()} onMethodology={() => { void finishOnboarding(); setShowMethodology(true) }} />}
      {showMethodology && <MethodologyDialog onClose={() => setShowMethodology(false)} />}
    </div>
  )
}

function isAiProvider(value: string | undefined): value is AiProvider {
  return value === 'gemini' || value === 'claude' || value === 'groq' || value === 'grok'
}

function ChatDialog({ provider, personalKeys, studyContext, onClose }: { provider: AiProvider; personalKeys: { gemini: string; groq: string }; studyContext?: string; onClose: () => void }) {
  const [messages, setMessages] = useState<ChatTurn[]>([])
  const [question, setQuestion] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [error, setError] = useState('')
  const transcript = messages.map((message) => `${message.role === 'user' ? 'Question' : 'Philologist'}:\n${message.content}`).join('\n\n')

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const content = question.trim()
    if (!content || isSending) return
    const nextMessages: ChatTurn[] = [...messages, { role: 'user', content }]
    setMessages(nextMessages)
    setQuestion('')
    setError('')
    setIsSending(true)
    try {
      const answer = await askPhilologist(provider, nextMessages, studyContext, personalKeys)
      setMessages([...nextMessages, { role: 'assistant', content: answer }])
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setIsSending(false)
    }
  }

  return <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !isSending) onClose() }}>
    <section className="chat-dialog" role="dialog" aria-modal="true" aria-labelledby="chat-title">
      <header className="chat-header"><div className="chat-title-icon"><Sparkles size={17} /></div><div><h2 id="chat-title">Ask the philologist</h2><p>Historical context · {providerLabel(provider)}</p></div>{messages.length > 0 && <button className="reader-save transcript-share" onClick={() => void shareText('Word Context · Research dialogue', `${transcript}\n\nShared from Word Context · Historical Exegesis Engine`).catch((cause: unknown) => setError(errorMessage(cause)))}><Share2 size={14} /> Share transcript</button>}<button className="icon-button" onClick={onClose} aria-label="Close chat"><X size={18} /></button></header>
      <div className="chat-messages" aria-live="polite">
        {!messages.length && <div className="chat-welcome"><div className="eyebrow">{studyContext ? 'WORD STUDY CONTEXT' : 'A CAREFUL RESEARCH COMPANION'}</div><p>{studyContext ? 'Ask a question about the word study you opened. The study is provided as context, not assumed to be correct.' : 'Ask about a word, text, or historical context. Answers should distinguish evidence from interpretation.'}</p></div>}
        {messages.map((message, index) => <article key={`${index}-${message.role}`} className={`chat-message ${message.role}`}><span>{message.role === 'user' ? 'YOU' : 'PHILOLOGIST'}</span><p>{message.content}</p>{message.role === 'assistant' && <div className="chat-actions"><button onClick={() => void copyText(message.content).catch((cause: unknown) => setError(errorMessage(cause)))}><Clipboard size={13} /> Copy</button><button onClick={() => void shareText('Word Context · Philologist response', message.content).catch((cause: unknown) => setError(errorMessage(cause)))}><Share2 size={13} /> Share</button></div>}</article>)}
        {isSending && <div className="chat-thinking"><LoaderCircle className="spin" size={15} /> Checking the question…</div>}
        {error && <div className="chat-error" role="alert">{error}</div>}
      </div>
      <form className="chat-composer" onSubmit={(event) => void sendMessage(event)}><textarea value={question} onChange={(event) => setQuestion(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit() } }} rows={2} maxLength={5000} placeholder="Ask a historical or linguistic question…" aria-label="Your question" /><button type="submit" className="button button-primary" disabled={!question.trim() || isSending} aria-label="Send question"><Send size={15} /></button></form>
      <footer className="chat-footer">AI responses can be incorrect. Verify claims against cited primary evidence.</footer>
    </section>
  </div>
}

function providerLabel(provider: AiProvider): string {
  return { gemini: 'Gemini', claude: 'Claude', groq: 'Groq', grok: 'Grok' }[provider]
}

function formatStudyContext(study: WordStudy): string {
  return [
    `Word: ${study.word}`,
    `Testament/language: ${study.testament === 'Greek' ? 'New Testament / Greek' : 'Old Testament / Hebrew'}`,
    `Original form: ${study.originalWord} (${study.transliteration})`,
    `Strong's number: ${study.strongsNumber}`,
    `Literal meaning: ${study.literalMeaning}`,
    `Study summary: ${study.thenMeaning}`,
  ].map((line) => line.slice(0, 500)).join('\n')
}

async function copyText(text: string): Promise<void> {
  if (!navigator.clipboard) throw new Error('Clipboard access is not available in this browser.')
  await navigator.clipboard.writeText(text)
}

async function shareText(title: string, text: string): Promise<void> {
  if (navigator.share) await navigator.share({ title, text })
  else await copyText(text)
}

function StatCard({ label, value, icon, note }: { label: string; value: string; icon: React.ReactNode; note: string }) {
  return <div className="stat-card"><div className="stat-top"><span>{label}</span><span className="stat-icon">{icon}</span></div><div className="stat-value">{value}</div><div className="stat-note">{note}</div></div>
}

function StudyCard({ study, index, onOpen, onFavorite }: { study: WordStudy; index: number; onOpen: () => void; onFavorite: () => void }) {
  return <article className={`study-card card-tone-${index % 4}`}><div className="study-card-top"><span className="study-code">{study.strongsNumber}</span><button className={`bookmark-button ${study.isFavorite ? 'saved' : ''}`} aria-label={study.isFavorite ? 'Remove from notebook' : 'Save to notebook'} onClick={onFavorite}>{study.isFavorite ? <BookMarked size={16} /> : <BookOpen size={16} />}</button></div><div className="card-script">{study.originalWord}</div><h3>{study.word}</h3><div className="card-translit">{study.transliteration}<span>·</span>{study.testament}</div><p>{study.literalMeaning}</p><button className="card-link" onClick={onOpen}>Open study <ArrowRight size={14} /></button></article>
}

function StudyReader({ study, onBack, onFavorite, onSaveNotes, onSaveTags, onDelete, onAskAi, isSaving }: { study: WordStudy; onBack: () => void; onFavorite: () => void; onSaveNotes: (notes: string) => void; onSaveTags: (tags: string[]) => void; onDelete: () => void; onAskAi: () => void; isSaving: boolean }) {
  const [notes, setNotes] = useState(study.userNotes)
  const [tags, setTags] = useState(study.userTags)
  const [tagInput, setTagInput] = useState('')
  const [exportOpen, setExportOpen] = useState(false)
  const [actionError, setActionError] = useState('')
  const sourceAudit = auditSources(study.searchGroundingSources ?? [], true)
  const linguisticNote = findLinguisticNote(study.strongsNumber)
  return <section className="study-reader" id="study-reader">
    <div className="reader-topline"><button className="text-button" onClick={onBack}><ArrowLeft size={14} /> Back to shelf</button><div className="reader-actions"><button className="reader-save" onClick={() => void shareText(`Word Study: ${study.word}`, buildExportText(study, 'pocket')).catch((cause: unknown) => setActionError(errorMessage(cause)))}><Share2 size={15} /> Share</button><button className="reader-save" onClick={() => setExportOpen(true)}><FileText size={15} /> Export</button><button className={`reader-save ${study.isFavorite ? 'saved' : ''}`} onClick={onFavorite}>{study.isFavorite ? <BookMarked size={16} /> : <BookOpen size={16} />}{study.isFavorite ? 'Saved' : 'Save study'}</button>{study.provenance && study.provenance !== 'curated' && <button className="reader-save delete-study" onClick={onDelete} aria-label="Delete this generated study"><Trash2 size={15} /> Delete</button>}</div></div>
    {actionError && <div className="chat-error reader-action-error" role="alert">{actionError}</div>}
    <div className="reader-title"><div className="reader-code">{study.strongsNumber} <span>{study.testament.toUpperCase()}</span><span className={`provenance-badge ${study.provenance ?? 'curated'}`}>{study.provenance === 'ai-generated' ? 'AI GENERATED' : study.provenance === 'lexicon-fallback' ? 'LEXICON ONLY' : 'CURATED'}</span></div><div className="reader-greek">{study.originalWord}</div><h2>{study.word}</h2><p>{study.transliteration} <span>·</span> Root {study.rootLemma}</p><div className="reader-study-actions"><button className="reader-speak" onClick={() => { try { if (!('speechSynthesis' in window)) throw new Error('Speech playback is not supported by this browser.'); window.speechSynthesis.cancel(); window.speechSynthesis.speak(new SpeechSynthesisUtterance(`${study.word}. ${study.originalWord}. ${study.thenMeaning}`)) } catch (cause) { setActionError(errorMessage(cause)) } }}><Volume2 size={14} /> Listen</button><button className="button button-small" onClick={onAskAi}><MessageCircle size={14} /> Ask AI about this word</button></div></div>
    <div className="reader-body">
      <div className="reader-main">
      {linguisticNote && <LinguisticNoteCard note={linguisticNote} compact />}
      <div className="meaning-compare"><MeaningBlock label="LITERAL SENSE" text={study.literalMeaning} /><MeaningBlock label="THEN · ANCIENT CONTEXT" text={study.thenMeaning} /><MeaningBlock label="NOW · COMMON GLOSS" text={study.nowMeaning} /></div>
        <div className="reader-section"><div className="eyebrow">THE ANCIENT WORLD</div><h3>Historical background</h3><p>{study.historicalBackground}</p></div>
        <div className="reader-section"><div className="eyebrow">PEOPLE & PRACTICE</div><h3>Cultural context</h3><p>{study.culturalContext}</p></div>
        <div className="reader-section"><div className="eyebrow">LAW & SOCIAL ORDER</div><h3>Legal dimension</h3><p>{study.legalDimension}</p></div>
        <div className="reader-section"><div className="eyebrow">WORD FAMILY</div><h3>Morphological family</h3><p className="family-text">{study.morphologicalFamilyTable}</p></div>
        <div className="reader-section"><div className="eyebrow">READ IN CONTEXT</div><h3>Key scriptures</h3><div className="scripture-list">{study.keyScriptures.map((scripture) => <span key={scripture}>{scripture}</span>)}</div></div>
        <div className="translation-note"><span>TRANSLATION DISCONNECT</span><p>{study.translationDisconnect}</p></div>
        <div className="reader-insight"><Sparkles size={17} /><p>{study.closingInsight}</p></div>
      </div>
      <aside className="reader-aside">
        <div className="aside-card"><div className="eyebrow">THEOLOGICAL WEIGHT</div><p>{study.theologicalWeight}</p></div>
        <div className="notes-field"><label htmlFor="study-notes"><span><NotebookPen size={14} /> YOUR NOTES</span></label><textarea id="study-notes" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Write a thought to revisit…" rows={5} /><button className="button button-small" onClick={() => onSaveNotes(notes)} disabled={isSaving}>{isSaving ? <LoaderCircle size={14} className="spin" /> : <Check size={14} />} Save notes</button>
          <div className="tag-editor"><span>STUDY TAGS</span><div className="tag-pills">{tags.map((tag) => <button key={tag} onClick={() => { const next = tags.filter((item) => item !== tag); setTags(next); onSaveTags(next) }} aria-label={`Remove tag ${tag}`}>{tag}<X size={11} /></button>)}</div><form onSubmit={(event) => { event.preventDefault(); const tag = tagInput.trim().replace(/^#/, ''); if (tag && !tags.some((item) => item.toLowerCase() === tag.toLowerCase())) { const next = [...tags, tag]; setTags(next); onSaveTags(next) }; setTagInput('') }} className="tag-add"><input value={tagInput} onChange={(event) => setTagInput(event.target.value)} aria-label="Add a study tag" placeholder="Add a tag…" maxLength={32} /><button type="submit" disabled={!tagInput.trim()}><Plus size={13} /> Add</button></form></div>
        </div>
        {sourceAudit.results.length > 0 && <div className="aside-card sources-card"><div className="eyebrow">SOURCE CHECK</div><strong>{sourceAudit.accepted.length} trusted source{sourceAudit.accepted.length === 1 ? '' : 's'}</strong><p>{sourceAudit.explanation}</p>{sourceAudit.accepted.map((source) => <a key={source.url} href={source.url} target="_blank" rel="noreferrer">{source.domain}<ArrowUpRight size={12} /></a>)}</div>}
      </aside>
    </div>
    {exportOpen && <ExportSheet study={study} onClose={() => setExportOpen(false)} />}
  </section>
}

type ExportFormat = 'sermon' | 'academic' | 'pocket'

function buildExportText(study: WordStudy, format: ExportFormat): string {
  if (format === 'sermon') {
    return [
      `SERMON STUDY OUTLINE: ${study.word}`,
      `${study.originalWord} (${study.transliteration}; ${study.strongsNumber})`,
      '',
      '1. Begin with the word in its ancient setting',
      study.literalMeaning,
      '',
      '2. Hear the term in its historical and cultural context',
      study.historicalBackground,
      study.culturalContext,
      '',
      '3. Read the passage with the full semantic range in view',
      study.thenMeaning,
      `Key passages: ${study.keyScriptures.join('; ')}`,
      '',
      `Closing insight: ${study.closingInsight}`,
      'Prepared with Word Context. Verify all claims and cited passages independently.',
    ].join('\n')
  }
  if (format === 'academic') {
    return [
      `# ${study.word}: Historical Word Study`,
      '',
      `**Lemma:** ${study.originalWord} (${study.transliteration})  `,
      `**Strong’s number:** ${study.strongsNumber}  `,
      `**Language:** ${study.testament}`,
      '',
      '## Lexical sense',
      study.literalMeaning,
      '',
      '## Historical and cultural setting',
      study.historicalBackground,
      '',
      study.culturalContext,
      '',
      '## Legal and theological dimensions',
      study.legalDimension,
      '',
      study.theologicalWeight,
      '',
      '## Morphology',
      study.morphologicalFamilyTable,
      '',
      '## Translation and usage',
      study.thenMeaning,
      '',
      study.translationDisconnect,
      '',
      '## Passages for comparison',
      ...study.keyScriptures.map((passage) => `- ${passage}`),
      '',
      '## Sources supplied with study',
      ...(study.searchGroundingSources?.length ? study.searchGroundingSources.map((source) => `- ${source}`) : ['- No external sources were supplied.']),
      '',
      'AI-generated material is a research aid, not a substitute for primary-source verification.',
    ].join('\n')
  }
  return [
    `${study.word} · ${study.originalWord} (${study.transliteration})`,
    `${study.strongsNumber} · ${study.testament}`,
    '',
    study.literalMeaning,
    `Then: ${study.thenMeaning}`,
    `Now: ${study.nowMeaning}`,
    '',
    `Read: ${study.keyScriptures.join(' · ')}`,
    study.closingInsight,
    'Word Context · Check sources in context.',
  ].join('\n')
}

function ExportSheet({ study, onClose }: { study: WordStudy; onClose: () => void }) {
  const [format, setFormat] = useState<ExportFormat>('sermon')
  const [error, setError] = useState('')
  const text = buildExportText(study, format)
  async function share() {
    try {
      await shareText(`Word Study: ${study.word}`, text)
    } catch (cause) {
      setError(errorMessage(cause))
    }
  }
  async function copy() {
    try {
      await copyText(text)
      onClose()
    } catch (cause) {
      setError(errorMessage(cause))
    }
  }
  return <div className="dialog-backdrop export-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <section className="export-dialog" role="dialog" aria-modal="true" aria-labelledby="export-title">
      <header className="export-header"><div><div className="eyebrow">STUDY EXPORT</div><h2 id="export-title">{study.word}</h2></div><button className="icon-button" onClick={onClose} aria-label="Close export"><X size={17} /></button></header>
      <div className="export-formats">{([['sermon', 'Sermon outline'], ['academic', 'Academic brief'], ['pocket', 'Pocket card']] as const).map(([value, label]) => <button key={value} className={format === value ? 'selected' : ''} onClick={() => setFormat(value)}>{label}</button>)}</div>
      <pre className="export-preview">{text}</pre>{error && <p className="chat-error">{error}</p>}
      <footer className="export-actions"><button className="button button-quiet" onClick={() => void share()}><Share2 size={14} /> Share</button><button className="button button-primary" onClick={() => void copy()}><Clipboard size={14} /> Copy</button></footer>
    </section>
  </div>
}

function LinguisticNoteCard({ note, compact = false, matchingStudy, onOpenStudy }: { note: LinguisticNote; compact?: boolean; matchingStudy?: WordStudy; onOpenStudy?: () => void }) {
  return <article className={`language-note-card ${compact ? 'compact' : ''}`}>
    <div className="language-note-heading"><span className="testament-code">{note.code}</span><span className="language-note-kind">{note.kind}</span></div>
    <div className="language-note-lemma">{note.lemma}<span>{note.transliteration}</span></div>
    <div className="language-note-senses"><div><small>COMMON SENSE</small><strong>{note.primarySense}</strong></div><ArrowRight size={14} /><div><small>CONTEXTUAL SENSE</small><strong>{note.contextualSense}</strong></div></div>
    <p>{note.explanation}</p>
    <div className="language-note-references"><strong>Compare:</strong> {note.references.join(' · ')}</div>
    <div className="language-note-actions"><a href={note.lexiconUrl} target="_blank" rel="noreferrer">{note.lexiconLabel}<ArrowUpRight size={12} /></a>{matchingStudy && onOpenStudy && <button className="text-button" onClick={onOpenStudy}>Open word study <ArrowRight size={13} /></button>}</div>
  </article>
}

function MeaningBlock({ label, text }: { label: string; text: string }) {
  return <div className="meaning-block"><div className="eyebrow">{label}</div><p>{text}</p></div>
}

function DossierReader({ dossier }: { dossier: ApologeticsDossier }) {
  const audited = auditSources(dossier.sources)
  return <article className="dossier-reader"><div className="eyebrow">{dossier.category}</div><h2>{dossier.title}</h2><p className="dossier-lede">{dossier.summary}</p><div className="dossier-question-box"><span>THE QUESTION</span><strong>{dossier.question}</strong></div><div className="reader-section"><div className="eyebrow">A MEASURED POSITION</div><h3>What the evidence can say</h3><p>{dossier.position}</p></div><div className="reader-section"><div className="eyebrow">EVIDENCE TO CONSIDER</div><h3>Points of reference</h3><ul className="evidence-list">{dossier.evidence.map((item) => <li key={item}><Check size={15} />{item}</li>)}</ul></div><div className="caveat-box"><ShieldCheck size={17} /><div><strong>Important caveat</strong><p>{dossier.caveat}</p></div></div><div className="source-list"><div className="eyebrow">STARTING POINTS</div>{dossier.sources.map((source, index) => <a key={source.url} href={source.url} target="_blank" rel="noreferrer"><span className="source-number">0{index + 1}</span><span><strong>{source.label}</strong><small>{audited.results[index]?.label} · {audited.results[index]?.score}/100</small></span><ArrowUpRight size={15} /></a>)}</div></article>
}

function PatristicArchive() {
  const epochs: PatristicEpoch[] = ['Apostolic Fathers', 'Ante-Nicene', 'Nicene & Post-Nicene']
  const [epoch, setEpoch] = useState<PatristicEpoch | 'All'>('All')
  const [actionError, setActionError] = useState('')
  const witnesses = epoch === 'All' ? patristicWitnesses : patristicWitnesses.filter((witness) => witness.epoch === epoch)
  return <section className="page-content">
    <div className="split-heading"><div><div className="eyebrow">EARLY CHRISTIAN PRIMARY WITNESSES</div><h2>Read the writers in their historical setting.</h2><p>Short excerpts with work-level citations and links to the full cited translation.</p></div><div className="dossier-count"><strong>{patristicWitnesses.length.toString().padStart(2, '0')}</strong><span>VERIFIED EXCERPTS</span></div></div>
    <div className="patristic-note"><ShieldCheck size={16} /><span>These are translations, not the original Greek or Latin. An excerpt illustrates its paragraph; it does not prove a biblical word's meaning on its own.</span></div>
    <div className="epoch-filters"><button className={epoch === 'All' ? 'selected' : ''} onClick={() => setEpoch('All')}>All periods</button>{epochs.map((item) => <button key={item} className={epoch === item ? 'selected' : ''} onClick={() => setEpoch(item)}>{item}</button>)}</div>
    {actionError && <div className="inline-alert alert-error" role="alert">{actionError}<button className="icon-button" onClick={() => setActionError('')} aria-label="Dismiss"><X size={14} /></button></div>}
    <div className="patristic-grid">{witnesses.map((witness) => {
      const sharePayload = `“${witness.excerpt}”\n\n${witness.father}, ${witness.work} (${witness.dates}). ${witness.sourceLabel}: ${witness.sourceUrl}`
      return <article className="patristic-card" key={`${witness.father}-${witness.work}`}><div className="patristic-meta"><span>{witness.epoch}</span><span>{witness.dates}</span></div><h3>{witness.father}</h3><div className="patristic-work">{witness.work}</div><blockquote>“{witness.excerpt}”</blockquote><p>{witness.context}</p><div className="patristic-actions"><button onClick={() => void copyText(sharePayload).catch((cause: unknown) => setActionError(errorMessage(cause)))}><Clipboard size={13} /> Copy citation</button><button onClick={() => void shareText(`${witness.father} · ${witness.work}`, sharePayload).catch((cause: unknown) => setActionError(errorMessage(cause)))}><Share2 size={13} /> Share</button><a href={witness.sourceUrl} target="_blank" rel="noreferrer">{witness.sourceLabel}<ArrowUpRight size={12} /></a></div></article>
    })}</div>
    {epoch === 'Nicene & Post-Nicene' && <EmptyState title="More witnesses are being reviewed" description="We are adding source-checked excerpts for this period; no unverified quotations are shown." />}
  </section>
}

function EmptyState({ title, description, action }: { title: string; description: string; action?: React.ReactNode }) {
  return <div className="empty-state"><div className="empty-icon"><BookOpen size={19} /></div><h3>{title}</h3><p>{description}</p>{action}</div>
}

function OnboardingDialog({ onContinue, onMethodology }: { onContinue: () => void; onMethodology: () => void }) {
  return <div className="dialog-backdrop onboarding-backdrop"><section className="onboarding-card" role="dialog" aria-modal="true" aria-labelledby="onboarding-title"><div className="brand-mark"><BookOpen size={22} /></div><div className="eyebrow">WELCOME TO WORD CONTEXT</div><h2 id="onboarding-title">Read ancient words in their own world.</h2><p>Explore curated word studies, Greek and Hebrew reference entries, and historical dossiers. Your library and notes stay on this device.</p><div className="onboarding-points"><span><BookOpen size={15} /> Begin with historical context</span><span><ShieldCheck size={15} /> Check evidence and uncertainty</span><span><Sparkles size={15} /> Use AI as a research aid, not an authority</span></div><button className="button button-primary onboarding-continue" onClick={onContinue}>Start exploring <ArrowRight size={15} /></button><button className="text-button" onClick={onMethodology}>Read methodology and limitations</button></section></div>
}

function MethodologyDialog({ onClose }: { onClose: () => void }) {
  return <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><section className="methodology-dialog" role="dialog" aria-modal="true" aria-labelledby="methodology-title"><header><div><div className="eyebrow">RESEARCH DISCLOSURE</div><h2 id="methodology-title">Methodology & limitations</h2></div><button className="icon-button" onClick={onClose} aria-label="Close disclosure"><X size={17} /></button></header><div className="methodology-copy"><h3>Historical interpretation</h3><p>Word meanings vary by period, genre, syntax, and social setting. A gloss, etymology, or parallel text cannot establish the meaning of every occurrence. Claims about Roman law, inscriptions, papyri, and ancient customs require passage-level evidence.</p><h3>AI and source ratings</h3><p>AI output may be wrong, incomplete, or cite sources inaccurately. Domain ratings classify publisher hosts; they do not verify that a specific page supports a claim. Grounding links are starting points, not proof.</p><h3>Library scope</h3><p>The bundled Strong’s lexicon and study collection are curated subsets, not exhaustive scholarly dictionaries or a complete concordance. Patristic and other primary-source material should be checked against reliable editions and translations.</p><h3>Privacy and availability</h3><p>Local studies and notes are stored in this browser and are not automatically synchronized. AI requests are sent to the server proxy and the provider configured by the deployment.</p></div><button className="button button-primary" onClick={onClose}>I understand</button></section></div>
}

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : 'An unexpected error occurred.'
}

export default App
