import { afterEach, describe, expect, it, vi } from 'vitest'
import { askPhilologist, generateStudy } from './gemini'

const validStudy = {
  word: 'Faith',
  testament: 'Greek',
  originalWord: 'πίστις',
  transliteration: 'pistis',
  strongsNumber: 'G4102',
  literalMeaning: 'Trust and fidelity',
  thenMeaning: 'Trust and fidelity in context',
  nowMeaning: 'Often narrowed to assent',
  historicalBackground: 'A common term for trustworthiness.',
  culturalContext: 'Use depended on social context.',
  legalDimension: 'It could describe good faith.',
  theologicalWeight: 'The term shapes the argument.',
  keyScriptures: ['Romans 1:17'],
  closingInsight: 'Read in context.',
  rootLemma: 'πιστ-',
  morphologicalFamilyTable: 'πίστις · πιστεύω · πιστός',
  translationDisconnect: 'The English gloss can be narrower.',
}

describe('AI study response validation', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('accepts a valid response and attaches AI provenance', async () => {
    const fetchStub = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ text: JSON.stringify(validStudy), sources: [] }),
    })
    vi.stubGlobal('fetch', fetchStub)

    const study = await generateStudy('claude', 'faith', { testament: 'Greek', useSearchGrounding: false, strictVerification: false })

    expect(study.word).toBe('Faith')
    expect(study.provenance).toBe('ai-generated')
    expect(study.searchGroundingSources).toEqual([])
    expect(fetchStub).toHaveBeenCalledWith('/api/ai', expect.objectContaining({
      body: expect.stringContaining('"provider":"claude"'),
    }))
    expect(fetchStub.mock.calls[0][1].body).toContain('"testament":"Greek"')
  })

  it('uses an optional personal Gemini key directly for word studies', async () => {
    const fetchStub = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(validStudy) }] } }] }),
    })
    vi.stubGlobal('fetch', fetchStub)

    const study = await generateStudy('gemini', 'faith', {
      testament: 'Greek',
      useSearchGrounding: false,
      strictVerification: false,
      geminiApiKey: 'personal-test-key',
    })

    expect(study.word).toBe('Faith')
    expect(fetchStub).toHaveBeenCalledOnce()
    expect(fetchStub.mock.calls[0][0]).toContain('/v1beta/models/gemini-3.8-flash:generateContent')
    expect(fetchStub.mock.calls[0][1].headers).toEqual({
      'Content-Type': 'application/json',
      'x-goog-api-key': 'personal-test-key',
    })
    expect(fetchStub.mock.calls[0][0]).not.toContain('personal-test-key')
  })

  it('requires trusted citations when strict verification is enabled', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ text: JSON.stringify(validStudy), sources: [] }),
    }))

    await expect(generateStudy('gemini', 'faith', { testament: 'Greek', useSearchGrounding: false, strictVerification: true }))
      .rejects.toThrow('Strict verification requires citations')
  })

  it('keeps only trusted-domain sources in strict mode', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        text: JSON.stringify(validStudy),
        sources: ['https://papyri.info/'],
      }),
    }))

    const study = await generateStudy('gemini', 'faith', { testament: 'Greek', useSearchGrounding: true, strictVerification: true })
    expect(study.searchGroundingSources).toEqual(['https://papyri.info/'])
  })

  it('rejects a generated study that conflicts with the selected testament', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ text: JSON.stringify({ ...validStudy, testament: 'Greek' }), sources: [] }),
    }))
    await expect(generateStudy('gemini', 'mercy', { testament: 'Hebrew', useSearchGrounding: false, strictVerification: false }))
      .rejects.toThrow('selected testament is Old Testament (Hebrew)')
  })

  it('accepts a study generated for the selected Old Testament Hebrew testament', async () => {
    const hebrewStudy = { ...validStudy, word: 'Peace', testament: 'Hebrew', originalWord: 'שָׁלוֹם', transliteration: 'shalom', strongsNumber: 'H7965' }
    const fetchStub = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ text: JSON.stringify(hebrewStudy), sources: [] }),
    })
    vi.stubGlobal('fetch', fetchStub)

    const study = await generateStudy('gemini', 'shalom', { testament: 'Hebrew', useSearchGrounding: false, strictVerification: false })

    expect(study.testament).toBe('Hebrew')
    expect(fetchStub.mock.calls[0][1].body).toContain('"testament":"Hebrew"')
  })

  it('sends chat turns through the selected provider proxy and returns text', async () => {
    const fetchStub = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ text: 'A contextual answer.', sources: [] }),
    })
    vi.stubGlobal('fetch', fetchStub)

    await expect(askPhilologist('groq', [{ role: 'user', content: 'What does peace mean here?' }]))
      .resolves.toBe('A contextual answer.')
    expect(fetchStub).toHaveBeenCalledWith('/api/ai', expect.objectContaining({
      body: expect.stringContaining('"provider":"groq"'),
    }))
  })

  it('sends word-study context with contextual chat questions', async () => {
    const fetchStub = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ text: 'A contextual answer.' }),
    })
    vi.stubGlobal('fetch', fetchStub)
    const context = 'Word: Faith\nTestament/language: New Testament / Greek'

    await askPhilologist('gemini', [{ role: 'user', content: 'How is this used here?' }], context)

    const request = JSON.parse(fetchStub.mock.calls[0][1].body)
    expect(request.messages).toEqual([
      { role: 'user', content: expect.stringContaining(context) },
      { role: 'user', content: 'How is this used here?' },
    ])
  })

  it('sends Gemini chat directly with the optional personal key', async () => {
    const fetchStub = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ candidates: [{ content: { parts: [{ text: 'Direct Gemini answer.' }] } }] }),
    })
    vi.stubGlobal('fetch', fetchStub)

    await expect(askPhilologist('gemini', [{ role: 'user', content: 'Explain the word.' }], undefined, 'personal-test-key'))
      .resolves.toBe('Direct Gemini answer.')

    expect(fetchStub).toHaveBeenCalledOnce()
    expect(fetchStub.mock.calls[0][0]).toContain('gemini-3.8-flash:generateContent')
    expect(fetchStub.mock.calls[0][1].headers['x-goog-api-key']).toBe('personal-test-key')
    expect(fetchStub.mock.calls[0][1].body).toContain('Explain the word.')
  })
})
