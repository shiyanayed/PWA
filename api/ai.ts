import { CHAT_SYSTEM_PROMPT, PHILOLOGIST_SYSTEM_PROMPT } from '../src/prompts.js'
import { GEMINI_MODELS } from '../src/gemini-models.js'

type Provider = 'gemini' | 'claude' | 'groq' | 'grok'
type Turn = { role: 'user' | 'assistant'; content: string }
type Request = {
  method?: string
  headers: Record<string, string | string[] | undefined>
  body?: unknown
  socket?: { remoteAddress?: string }
}
type Response = {
  status(code: number): Response
  json(value: unknown): void
  setHeader(name: string, value: string): void
  end(): void
}

class ProviderHttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly retryAfter?: string,
    readonly offlineFallbackAvailable = false,
  ) {
    super(message)
    this.name = 'ProviderHttpError'
  }
}

declare const process: { env: Record<string, string | undefined> }

const limits = new Map<string, { count: number; resetsAt: number }>()
const requestsPerMinute = 20
const maxRequestBytes = 48_000
const providerKeys: Record<Provider, string> = {
  gemini: 'GEMINI_API_KEY',
  claude: 'ANTHROPIC_API_KEY',
  groq: 'GROQ_API_KEY',
  grok: 'XAI_API_KEY',
}

export default async function handler(request: Request, response: Response): Promise<void> {
  response.setHeader('Cache-Control', 'no-store')
  response.setHeader('Content-Type', 'application/json; charset=utf-8')

  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST')
    response.status(405).json({ error: 'Use POST for AI requests.' })
    return
  }

  if (!isAllowedOrigin(request)) {
    response.status(403).json({ error: 'This origin is not allowed to use the AI endpoint.' })
    return
  }

  const ip = headerValue(request, 'x-forwarded-for')?.split(',')[0]?.trim()
    || request.socket?.remoteAddress
    || 'unknown'
  if (!allowRequest(ip)) {
    response.status(429).json({ error: 'Too many AI requests. Please wait a minute and try again.' })
    return
  }

  let bodySize: number
  try {
    bodySize = new TextEncoder().encode(JSON.stringify(request.body)).byteLength
  } catch {
    response.status(400).json({ error: 'Request body must be valid JSON.' })
    return
  }
  if (bodySize > maxRequestBytes) {
    response.status(413).json({ error: 'Request is too large.' })
    return
  }
  if (!request.body || typeof request.body !== 'object' || Array.isArray(request.body)) {
    response.status(400).json({ error: 'Request body must be a JSON object.' })
    return
  }

  const body = request.body as Record<string, unknown>
  const provider = body.provider
  const mode = body.mode
  if (!isProvider(provider)) {
    response.status(400).json({ error: 'Choose a supported AI provider.' })
    return
  }
  const key = process.env[providerKeys[provider]]
  if (!key) {
    response.status(503).json({ error: `${providerLabel(provider)} is not configured on the server.` })
    return
  }

  let turns: Turn[]
  if (mode === 'study') {
    if (typeof body.query !== 'string' || !body.query.trim() || body.query.length > 240) {
      response.status(400).json({ error: 'Enter a word or Strong’s number (up to 240 characters).' })
      return
    }
    if (body.testament !== 'Greek' && body.testament !== 'Hebrew') {
      response.status(400).json({ error: 'Select Old Testament (Hebrew) or New Testament (Greek) before creating a word study.' })
      return
    }
    const testamentLabel = body.testament === 'Greek' ? 'New Testament (Greek)' : 'Old Testament (Hebrew)'
    turns = [{ role: 'user', content: `Create a historically grounded ${testamentLabel} word study for: ${body.query.trim()}. Set the testament field to "${body.testament}". Return strict JSON only.` }]
  } else if (mode === 'chat') {
    const parsed = parseTurns(body.messages)
    if (!parsed) {
      response.status(400).json({ error: 'Chat must include 1–20 valid messages.' })
      return
    }
    turns = parsed
  } else {
    response.status(400).json({ error: 'Choose study or chat mode.' })
    return
  }

  const useSearchGrounding = body.useSearchGrounding === true
  if (useSearchGrounding && (provider !== 'gemini' || mode !== 'study')) {
    response.status(400).json({ error: 'Google Search grounding is available for Gemini word studies only.' })
    return
  }

  try {
    const result = await requestProvider(
      provider,
      key,
      mode === 'study' ? PHILOLOGIST_SYSTEM_PROMPT : CHAT_SYSTEM_PROMPT,
      turns,
      mode === 'study',
      useSearchGrounding,
    )
    response.status(200).json(result)
  } catch (error) {
    console.error('AI provider request failed', { provider, message: error instanceof Error ? error.message : 'unknown error' })
    if (error instanceof ProviderHttpError && error.status === 429) {
      if (error.retryAfter && /^\d+$/.test(error.retryAfter)) response.setHeader('Retry-After', error.retryAfter)
      const detail = error.message ? ` Provider detail: ${error.message}` : ''
      response.status(429).json({
        error: `${providerLabel(provider)} rate limit or quota reached. Check the provider project’s limits and billing.${detail}`,
        offlineFallbackAvailable: error.offlineFallbackAvailable,
      })
      return
    }
    if (error instanceof ProviderHttpError && error.offlineFallbackAvailable) {
      response.status(503).json({
        error: `${providerLabel(provider)} is temporarily unavailable after trying the configured Gemini models. ${error.message}`,
        offlineFallbackAvailable: true,
      })
      return
    }
    response.status(502).json({ error: `${providerLabel(provider)} could not complete the request. Check server configuration and try again.` })
  }
}

async function requestProvider(
  provider: Provider,
  key: string,
  system: string,
  turns: Turn[],
  jsonMode: boolean,
  useSearchGrounding: boolean,
): Promise<{ text: string; sources: string[] }> {
  let endpoint: string
  let headers: Record<string, string>
  let payload: Record<string, unknown>

  if (provider === 'gemini') {
    return requestGeminiWithFallback(key, system, turns, jsonMode, useSearchGrounding)
  } else if (provider === 'claude') {
    endpoint = 'https://api.anthropic.com/v1/messages'
    headers = { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' }
    payload = { model: 'claude-3-5-haiku-latest', max_tokens: 4096, system, messages: turns }
  } else {
    endpoint = provider === 'groq' ? 'https://api.groq.com/openai/v1/chat/completions' : 'https://api.x.ai/v1/chat/completions'
    headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` }
    payload = {
      model: provider === 'groq' ? 'llama-3.3-70b-versatile' : 'grok-3-mini',
      messages: [{ role: 'system', content: system }, ...turns],
      temperature: 0.2,
      max_tokens: 4096,
      ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
    }
  }

  const upstream = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(60_000),
  })
  if (!upstream.ok) {
    const providerMessage = await extractProviderErrorMessage(upstream, key)
    throw new ProviderHttpError(
      upstream.status,
      providerMessage ?? `Provider returned HTTP ${upstream.status}`,
      upstream.headers.get('retry-after') ?? undefined,
    )
  }
  const result = await upstream.json() as Record<string, unknown>
  const text = provider === 'claude'
    ? extractClaudeText(result)
    : extractOpenAiText(result)
  if (!text) throw new Error('Provider response contained no text')
  return { text, sources: [] }
}

async function requestGeminiWithFallback(
  key: string,
  system: string,
  turns: Turn[],
  jsonMode: boolean,
  useSearchGrounding: boolean,
): Promise<{ text: string; sources: string[]; model: string }> {
  let lastError: ProviderHttpError | undefined

  for (const model of GEMINI_MODELS) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      let upstream: globalThis.Response
      try {
        upstream = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              system_instruction: { parts: [{ text: system }] },
              contents: turns.map((turn) => ({ role: turn.role === 'assistant' ? 'model' : 'user', parts: [{ text: turn.content }] })),
              generationConfig: { ...(jsonMode ? { responseMimeType: 'application/json' } : {}), temperature: 0.2, maxOutputTokens: 4096 },
              ...(useSearchGrounding ? { tools: [{ google_search: {} }] } : {}),
            }),
            signal: AbortSignal.timeout(5_000),
          },
        )
      } catch {
        lastError = new ProviderHttpError(503, 'Gemini request timed out or failed.', undefined, true)
        if (attempt === 0) await delay(1000)
        continue
      }
      if (upstream.ok) {
        const result = await upstream.json() as Record<string, unknown>
        const text = extractGeminiText(result)
        if (!text) throw new Error(`Gemini model ${model} returned no text.`)
        return {
          text,
          sources: useSearchGrounding ? extractGeminiSources(result) : [],
          model,
        }
      }

      const providerMessage = await extractProviderErrorMessage(upstream, key)
      const failure = new ProviderHttpError(
        upstream.status,
        providerMessage ?? `Provider returned HTTP ${upstream.status}`,
        upstream.headers.get('retry-after') ?? undefined,
        upstream.status === 404 || upstream.status === 429 || upstream.status === 500 || upstream.status === 503,
      )
      lastError = failure

      if (upstream.status === 404) break
      if (![429, 500, 503].includes(upstream.status)) throw failure
      if (attempt === 0) await delay(1000)
    }
  }

  throw new ProviderHttpError(
    lastError?.status === 429 ? 429 : 503,
    lastError?.message ?? 'No configured Gemini model completed the request.',
    lastError?.retryAfter,
    true,
  )
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

async function extractProviderErrorMessage(upstream: globalThis.Response, key: string): Promise<string | undefined> {
  try {
    const payload = await upstream.json() as { error?: { message?: unknown } }
    const message = payload.error?.message
    if (typeof message !== 'string' || !message.trim()) return undefined
    return message.trim().slice(0, 500).replaceAll(key, '[redacted]')
  } catch {
    return undefined
  }
}

function extractGeminiText(result: Record<string, unknown>): string {
  const candidates = result.candidates as Array<{ content?: { parts?: Array<{ text?: string }> } }> | undefined
  return candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('').trim() ?? ''
}

function extractGeminiSources(result: Record<string, unknown>): string[] {
  const candidates = result.candidates as Array<{ groundingMetadata?: { groundingChunks?: Array<{ web?: { uri?: string } }> } }> | undefined
  const chunks = candidates?.[0]?.groundingMetadata?.groundingChunks ?? []
  return [...new Set(chunks.flatMap((chunk) => typeof chunk.web?.uri === 'string' ? [chunk.web.uri] : []))]
}

function extractClaudeText(result: Record<string, unknown>): string {
  const content = result.content as Array<{ type?: string; text?: string }> | undefined
  return content?.filter((part) => part.type === 'text').map((part) => part.text ?? '').join('').trim() ?? ''
}

function extractOpenAiText(result: Record<string, unknown>): string {
  const choices = result.choices as Array<{ message?: { content?: unknown } }> | undefined
  const content = choices?.[0]?.message?.content
  return typeof content === 'string' ? content.trim() : ''
}

function parseTurns(value: unknown): Turn[] | undefined {
  if (!Array.isArray(value) || value.length < 1 || value.length > 20) return undefined
  const turns: Turn[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object') return undefined
    const turn = item as Record<string, unknown>
    if ((turn.role !== 'user' && turn.role !== 'assistant') || typeof turn.content !== 'string' || !turn.content.trim() || turn.content.length > 5000) return undefined
    turns.push({ role: turn.role, content: turn.content.trim() })
  }
  if (turns[turns.length - 1]?.role !== 'user') return undefined
  return turns
}

function allowRequest(ip: string): boolean {
  const now = Date.now()
  const current = limits.get(ip)
  if (!current || current.resetsAt <= now) {
    limits.set(ip, { count: 1, resetsAt: now + 60_000 })
    return true
  }
  if (current.count >= requestsPerMinute) return false
  current.count += 1
  return true
}

function isAllowedOrigin(request: Request): boolean {
  const origin = headerValue(request, 'origin')
  if (!origin) return true
  try {
    const parsedOrigin = new URL(origin)
    const configuredOrigin = process.env.APP_ORIGIN
    if (configuredOrigin) return parsedOrigin.origin === new URL(configuredOrigin).origin
    const host = headerValue(request, 'x-forwarded-host') ?? headerValue(request, 'host')
    return !!host && parsedOrigin.host === host
  } catch {
    return false
  }
}

function headerValue(request: Request, name: string): string | undefined {
  const entry = Object.entries(request.headers).find(([key]) => key.toLowerCase() === name)
  const value = entry?.[1]
  return Array.isArray(value) ? value[0] : value
}

function isProvider(value: unknown): value is Provider {
  return value === 'gemini' || value === 'claude' || value === 'groq' || value === 'grok'
}

function providerLabel(provider: Provider): string {
  return { gemini: 'Gemini', claude: 'Claude', groq: 'Groq', grok: 'Grok' }[provider]
}
