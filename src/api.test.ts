import { afterEach, describe, expect, it, vi } from 'vitest'
import handler from '../api/ai'

function responseRecorder() {
  const result: { statusCode: number; body: unknown; headers: Record<string, string> } = {
    statusCode: 200,
    body: undefined,
    headers: {},
  }
  return {
    result,
    status(code: number) {
      result.statusCode = code
      return this
    },
    json(value: unknown) {
      result.body = value
    },
    setHeader(name: string, value: string) {
      result.headers[name] = value
    },
    end() {},
  }
}

describe('AI proxy', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    delete process.env.GEMINI_API_KEY
    delete process.env.ANTHROPIC_API_KEY
    delete process.env.GROQ_API_KEY
    delete process.env.XAI_API_KEY
    delete process.env.APP_ORIGIN
  })

  it('rejects non-POST requests', async () => {
    const response = responseRecorder()
    await handler({ method: 'GET', headers: { host: 'example.test' } }, response)
    expect(response.result.statusCode).toBe(405)
    expect(response.result.headers.Allow).toBe('POST')
  })

  it('rejects requests from a different origin', async () => {
    const response = responseRecorder()
    await handler({
      method: 'POST',
      headers: { host: 'example.test', origin: 'https://attacker.test' },
      body: { mode: 'study', provider: 'gemini', query: 'faith', testament: 'Greek' },
    }, response)
    expect(response.result.statusCode).toBe(403)
  })

  it('reports missing server-side provider configuration', async () => {
    const response = responseRecorder()
    await handler({
      method: 'POST',
      headers: { host: 'example.test', origin: 'https://example.test' },
      body: { mode: 'study', provider: 'gemini', query: 'faith', testament: 'Greek' },
    }, response)
    expect(response.result.statusCode).toBe(503)
    expect(response.result.body).toEqual({ error: 'Gemini is not configured on the server.' })
  })

  it('routes study generation to Gemini without returning provider credentials', async () => {
    process.env.GEMINI_API_KEY = 'server-only-test-key'
    const upstreamFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ candidates: [{ content: { parts: [{ text: '{"word":"Faith"}' }] } }] }),
    })
    vi.stubGlobal('fetch', upstreamFetch)

    const response = responseRecorder()
    await handler({
      method: 'POST',
      headers: { host: 'example.test', origin: 'https://example.test', 'x-forwarded-for': '192.0.2.41' },
      body: { mode: 'study', provider: 'gemini', query: 'faith', testament: 'Greek' },
    }, response)

    expect(response.result.statusCode).toBe(200)
    expect(response.result.body).toEqual({ text: '{"word":"Faith"}', sources: [] })
    expect(JSON.stringify(response.result.body)).not.toContain('server-only-test-key')
    expect(upstreamFetch).toHaveBeenCalledOnce()
    expect(String(upstreamFetch.mock.calls[0][0])).toContain('/v1beta/models/gemini-3.8-flash:generateContent')
  })

  it('rejects missing or invalid testament selections before contacting a provider', async () => {
    process.env.GEMINI_API_KEY = 'server-only-test-key'
    const upstreamFetch = vi.fn()
    vi.stubGlobal('fetch', upstreamFetch)

    for (const [index, testament] of [undefined, 'Latin'].entries()) {
      const response = responseRecorder()
      await handler({
        method: 'POST',
        headers: { host: 'example.test', origin: 'https://example.test', 'x-forwarded-for': `192.0.2.${91 + index}` },
        body: { mode: 'study', provider: 'gemini', query: 'faith', ...(testament ? { testament } : {}) },
      }, response)
      expect(response.result.statusCode).toBe(400)
    }
    expect(upstreamFetch).not.toHaveBeenCalled()
  })

  it.each([
    { provider: 'claude', keyName: 'ANTHROPIC_API_KEY', endpoint: 'api.anthropic.com', result: { content: [{ type: 'text', text: 'Claude answer' }] } },
    { provider: 'groq', keyName: 'GROQ_API_KEY', endpoint: 'api.groq.com', result: { choices: [{ message: { content: 'Groq answer' } }] } },
    { provider: 'grok', keyName: 'XAI_API_KEY', endpoint: 'api.x.ai', result: { choices: [{ message: { content: 'Grok answer' } }] } },
  ])('routes chat requests to $provider and returns only the response text', async ({ provider, keyName, endpoint, result }) => {
    process.env[keyName] = `test-${provider}-secret`
    const upstreamFetch = vi.fn().mockResolvedValue({ ok: true, json: async () => result })
    vi.stubGlobal('fetch', upstreamFetch)

    const response = responseRecorder()
    await handler({
      method: 'POST',
      headers: { host: 'example.test', origin: 'https://example.test', 'x-forwarded-for': `192.0.2.${provider.length + 50}` },
      body: { mode: 'chat', provider, messages: [{ role: 'user', content: 'Explain the word in context.' }] },
    }, response)

    expect(response.result.statusCode).toBe(200)
    expect(response.result.body).toEqual({
      text: provider === 'claude' ? 'Claude answer' : provider === 'groq' ? 'Groq answer' : 'Grok answer',
      sources: [],
    })
    expect(String(upstreamFetch.mock.calls[0][0])).toContain(endpoint)
    expect(JSON.stringify(response.result.body)).not.toContain(`test-${provider}-secret`)
  })

  it('rejects Gemini grounding on other providers without contacting the provider', async () => {
    process.env.ANTHROPIC_API_KEY = 'server-only-test-key'
    const upstreamFetch = vi.fn()
    vi.stubGlobal('fetch', upstreamFetch)

    const response = responseRecorder()
    await handler({
      method: 'POST',
      headers: { host: 'example.test', origin: 'https://example.test', 'x-forwarded-for': '192.0.2.90' },
      body: { mode: 'study', provider: 'claude', query: 'faith', testament: 'Greek', useSearchGrounding: true },
    }, response)

    expect(response.result.statusCode).toBe(400)
    expect(upstreamFetch).not.toHaveBeenCalled()
  })
})
