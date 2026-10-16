import { afterEach, describe, expect, it, vi } from 'vitest'
import handler from './ai'

function responseRecorder() {
  const result: { statusCode: number; body: unknown; headers: Record<string, string> } = {
    statusCode: 200,
    body: undefined,
    headers: {},
  }
  return {
    result,
    setHeader(name: string, value: string) {
      result.headers[name] = value
    },
    status(code: number) {
      result.statusCode = code
      return {
        json(value: unknown) {
          result.body = value
        },
        end() {},
      }
    },
  }
}

describe('Gemini API model fallback', () => {
  afterEach(() => {
    delete process.env.GEMINI_API_KEY
    vi.unstubAllGlobals()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('retries a 503 after 1.5 seconds, then falls back to Gemini 1.5 Flash', async () => {
    process.env.GEMINI_API_KEY = 'server-test-key'
    vi.useFakeTimers()
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout')
    const upstreamFetch = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 503, text: async () => 'busy' })
      .mockResolvedValueOnce({ ok: false, status: 503, text: async () => 'still busy' })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify({
          candidates: [{ content: { parts: [{ text: '{"word":"Faith"}' }] } }],
        }),
      })
    vi.stubGlobal('fetch', upstreamFetch)

    const response = responseRecorder()
    const request = handler(
      { method: 'POST', body: { query: 'faith' } },
      response as never,
    )
    await vi.runAllTimersAsync()
    await request

    const urls = upstreamFetch.mock.calls.map(([url]) => String(url))
    expect(urls).toEqual([
      expect.stringContaining('/models/gemini-flash-latest:'),
      expect.stringContaining('/models/gemini-flash-latest:'),
      expect.stringContaining('/models/gemini-1.5-flash:'),
    ])
    expect(urls.join(' ')).not.toMatch(/gemini-(?:2\.5|3\.5-flash-lite)/)
    expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 1500)
    expect(response.result.statusCode).toBe(200)
    expect(response.result.body).toMatchObject({ success: true, study: { word: 'Faith' } })
  })
})
