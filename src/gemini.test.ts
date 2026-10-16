import { afterEach, describe, expect, it, vi } from 'vitest'
import { AiRequestError, askPhilologist, canUseOfflineFallback, generateStudy, safeParseGeminiJson } from './gemini'
import { GEMINI_MODELS } from './gemini-models'

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
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('uses the configured public Gemini model IDs in the intended order', () => {
    expect(GEMINI_MODELS).toEqual([
      'gemini-flash-latest',
      'gemini-3.5-flash-lite',
    ])
  })

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

  it('parses fenced JSON with a preamble and unescaped newlines in strings', async () => {
    let rawText = JSON.stringify({ ...validStudy, historicalBackground: 'First line\nSecond line' })
    rawText = rawText.replace('First line\\nSecond line', 'First line\nSecond line')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ text: `Study result:\n\`\`\`json\n${rawText}\n\`\`\``, sources: [] }),
    }))

    const study = await generateStudy('gemini', 'faith', {
      testament: 'Greek',
      useSearchGrounding: false,
      strictVerification: false,
    })

    expect(study.historicalBackground).toBe('First line\nSecond line')
  })

  it('parses JSON arrays and rejects empty AI responses', () => {
    expect(safeParseGeminiJson<string[]>('```json\n["one", "two"]\n```')).toEqual(['one', 'two'])
    expect(() => safeParseGeminiJson('  ')).toThrow('Empty AI response received.')
  })

  it('repairs unescaped quotes inside JSON string values', () => {
    const rawText = '{"historicalBackground":"Roman law "adoptio" conferred family status."}'
    expect(safeParseGeminiJson<{ historicalBackground: string }>(rawText)).toEqual({
      historicalBackground: 'Roman law "adoptio" conferred family status.',
    })
  })

  it('sends Gemini word studies through the server proxy', async () => {
    const fetchStub = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ text: JSON.stringify(validStudy), sources: [] }),
    })
    vi.stubGlobal('fetch', fetchStub)

    const study = await generateStudy('gemini', 'faith', {
      testament: 'Greek',
      useSearchGrounding: false,
      strictVerification: false,
    })

    expect(study.word).toBe('Faith')
    expect(fetchStub).toHaveBeenCalledWith('/api/ai', expect.objectContaining({
      method: 'POST',
      body: expect.stringContaining('"provider":"gemini"'),
    }))
    expect(fetchStub.mock.calls[0][1].body).toContain('"query":"faith"')
  })

  it('uses an already-parsed study returned by the AI proxy', async () => {
    const json = vi.fn().mockResolvedValue({
      success: true,
      study: validStudy,
      sources: ['https://papyri.info/'],
    })
    const fetchStub = vi.fn().mockResolvedValue({ ok: true, json })
    vi.stubGlobal('fetch', fetchStub)

    const study = await generateStudy('gemini', 'faith', {
      testament: 'Greek',
      useSearchGrounding: false,
      strictVerification: false,
    })

    expect(study.word).toBe('Faith')
    expect(study.searchGroundingSources).toEqual(['https://papyri.info/'])
    expect(json).toHaveBeenCalledOnce()
  })

  it('sends Search grounding preference to the server proxy', async () => {
    const fetchStub = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ text: JSON.stringify(validStudy), sources: ['https://papyri.info/'] }),
    })
    vi.stubGlobal('fetch', fetchStub)

    await generateStudy('gemini', 'faith', {
      testament: 'Greek',
      useSearchGrounding: true,
      strictVerification: false,
    })

    expect(JSON.parse(fetchStub.mock.calls[0][1].body)).toMatchObject({
      provider: 'gemini',
      query: 'faith',
      useSearchGrounding: true,
    })
  })

  it('only enables local fallback for explicit temporary server outage errors', () => {
    expect(canUseOfflineFallback(new AiRequestError('Temporary outage.', 503, true))).toBe(true)
    expect(canUseOfflineFallback(new AiRequestError('Invalid request.', 400, false))).toBe(false)
    expect(canUseOfflineFallback(new Error('Unrelated failure.'))).toBe(false)
  })

  it('preserves the server cascade fallback signal for proxy requests', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({ error: 'Gemini models are unavailable.', offlineFallbackAvailable: true }),
    }))

    const request = generateStudy('gemini', 'faith', {
      testament: 'Greek',
      useSearchGrounding: false,
      strictVerification: false,
    })
    await expect(request).rejects.toMatchObject({
      status: 503,
      offlineFallbackAvailable: true,
    })
  })

  it('does not mark non-retryable proxy Gemini errors for offline fallback', async () => {
    const fetchStub = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: { message: 'Invalid request.' } }),
    })
    vi.stubGlobal('fetch', fetchStub)

    await expect(generateStudy('gemini', 'faith', {
      testament: 'Greek',
      useSearchGrounding: false,
      strictVerification: false,
    })).rejects.toMatchObject({
      status: 400,
      offlineFallbackAvailable: false,
    })
    expect(fetchStub).toHaveBeenCalledOnce()
  })

  it('uses an optional personal Groq key directly for word studies', async () => {
    const fetchStub = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: JSON.stringify(validStudy) } }] }),
    })
    vi.stubGlobal('fetch', fetchStub)

    const study = await generateStudy('groq', 'faith', {
      testament: 'Greek',
      useSearchGrounding: false,
      strictVerification: false,
      groqApiKey: 'personal-groq-test-key',
    })

    expect(study.word).toBe('Faith')
    expect(fetchStub).toHaveBeenCalledOnce()
    expect(fetchStub.mock.calls[0][0]).toBe('https://api.groq.com/openai/v1/chat/completions')
    expect(fetchStub.mock.calls[0][1].headers.Authorization).toBe('Bearer personal-groq-test-key')
    expect(fetchStub.mock.calls[0][1].body).toContain('"model":"llama-3.3-70b-versatile"')
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

  it('sends Gemini chat through the server proxy', async () => {
    const fetchStub = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ text: 'Proxied Gemini answer.' }),
    })
    vi.stubGlobal('fetch', fetchStub)

    await expect(askPhilologist('gemini', [{ role: 'user', content: 'Explain the word.' }]))
      .resolves.toBe('Proxied Gemini answer.')

    expect(fetchStub).toHaveBeenCalledOnce()
    expect(fetchStub.mock.calls[0][0]).toBe('/api/ai')
    expect(fetchStub.mock.calls[0][1].body).toContain('"provider":"gemini"')
    expect(fetchStub.mock.calls[0][1].body).toContain('Explain the word.')
  })

  it('sends Groq chat directly with the optional personal key', async () => {
    const fetchStub = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'Direct Groq answer.' } }] }),
    })
    vi.stubGlobal('fetch', fetchStub)

    await expect(askPhilologist('groq', [{ role: 'user', content: 'Explain the word.' }], undefined, { groq: 'personal-groq-test-key' }))
      .resolves.toBe('Direct Groq answer.')

    expect(fetchStub).toHaveBeenCalledOnce()
    expect(fetchStub.mock.calls[0][0]).toBe('https://api.groq.com/openai/v1/chat/completions')
    expect(fetchStub.mock.calls[0][1].headers.Authorization).toBe('Bearer personal-groq-test-key')
  })
})
