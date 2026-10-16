import type { WordStudy } from './types'
import type { Testament } from './types'
import { auditSources } from './trust'
import { CHAT_SYSTEM_PROMPT, PHILOLOGIST_SYSTEM_PROMPT } from './prompts'

export { PHILOLOGIST_SYSTEM_PROMPT }
export const GROQ_MODEL = 'llama-3.3-70b-versatile'

export class AiRequestError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly offlineFallbackAvailable = false,
  ) {
    super(message)
    this.name = 'AiRequestError'
  }
}

export function canUseOfflineFallback(error: unknown): boolean {
  return error instanceof AiRequestError && error.offlineFallbackAvailable
}

export function safeParseGeminiJson<T = unknown>(rawText: string): T {
  if (typeof rawText !== 'string' || !rawText.trim()) {
    throw new Error('Empty AI response received.')
  }

  const cleaned = rawText.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
  const quoteRepaired = repairInternalQuotes(cleaned)
  const candidates = new Set<string>([cleaned, quoteRepaired])
  for (const text of [...candidates]) {
    const candidate = extractJsonCandidate(text)
    if (candidate) candidates.add(candidate)
    const repairedCandidate = extractJsonCandidate(repairInternalQuotes(text))
    if (repairedCandidate) candidates.add(repairedCandidate)
  }

  let lastError: unknown

  for (const text of candidates) {
    const repaired = repairInternalQuotes(text)
    for (const input of [text, repaired, sanitizeControlCharactersInJson(repaired)]) {
      try {
        return JSON.parse(input) as T
      } catch (error) {
        lastError = error
      }
    }
  }

  const message = lastError instanceof Error ? lastError.message : 'unknown parse error'
  throw new Error(`Invalid JSON from AI: ${message}`)
}

function extractJsonCandidate(text: string): string | undefined {
  for (let start = 0; start < text.length; start += 1) {
    if (text[start] !== '{' && text[start] !== '[') continue

    const closing: string[] = []
    let insideString = false
    let isEscaped = false
    for (let index = start; index < text.length; index += 1) {
      const char = text[index]
      if (insideString) {
        if (isEscaped) isEscaped = false
        else if (char === '\\') isEscaped = true
        else if (char === '"') insideString = false
        continue
      }
      if (char === '"') {
        insideString = true
      } else if (char === '{') {
        closing.push('}')
      } else if (char === '[') {
        closing.push(']')
      } else if (char === '}' || char === ']') {
        if (closing.pop() !== char) break
        if (closing.length === 0) return text.slice(start, index + 1)
      }
    }
  }
  return undefined
}

function sanitizeControlCharactersInJson(jsonText: string): string {
  let insideString = false
  let isEscaped = false
  let result = ''

  for (let index = 0; index < jsonText.length; index += 1) {
    const char = jsonText[index]
    const code = jsonText.charCodeAt(index)

    if (insideString && !isEscaped && code < 32) {
      result += `\\u${code.toString(16).padStart(4, '0')}`
    } else {
      result += char
    }

    if (insideString) {
      if (isEscaped) isEscaped = false
      else if (char === '\\') isEscaped = true
      else if (char === '"') insideString = false
    } else if (char === '"') {
      insideString = true
    }
  }

  return result
}

function repairInternalQuotes(jsonText: string): string {
  let insideString = false
  let isEscaped = false
  let result = ''

  for (let index = 0; index < jsonText.length; index += 1) {
    const char = jsonText[index]

    if (char === '"' && insideString && !isEscaped) {
      let nextIndex = index + 1
      while (/\s/.test(jsonText[nextIndex] ?? '') && nextIndex < jsonText.length) nextIndex += 1
      const next = jsonText[nextIndex]
      if (next && ![',', '}', ']', ':'].includes(next)) {
        result += '\\"'
        continue
      }
      insideString = false
      result += char
      continue
    }

    result += char
    if (char === '"' && !insideString && !isEscaped) {
      insideString = true
    }

    if (isEscaped) isEscaped = false
    else if (char === '\\') isEscaped = true
  }

  return result
}

function extractJson(text: string): unknown {
  try {
    return safeParseGeminiJson(text)
  } catch (error) {
    throw new Error(`Gemini returned invalid JSON: ${error instanceof Error ? error.message : 'unknown parse error'}`)
  }
}

function validateStudy(
  value: unknown,
  expectedTestament: Testament,
  strictVerification = false,
  actualSources: string[] = [],
): Omit<WordStudy, 'id' | 'userNotes' | 'userTags' | 'isFavorite' | 'updatedAt'> {
  if (!value || typeof value !== 'object') throw new Error('Gemini response must be a JSON object.')
  const record = value as Record<string, unknown>
  const required = ['word', 'testament', 'originalWord', 'transliteration', 'strongsNumber', 'literalMeaning', 'thenMeaning', 'nowMeaning', 'historicalBackground', 'culturalContext', 'legalDimension', 'theologicalWeight', 'closingInsight', 'rootLemma', 'morphologicalFamilyTable', 'translationDisconnect']
  for (const key of required) {
    if (typeof record[key] !== 'string' || !(record[key] as string).trim()) throw new Error(`Gemini response is missing a valid "${key}" field.`)
  }
  if (record.testament !== 'Greek' && record.testament !== 'Hebrew') throw new Error('Gemini response has an unsupported testament value.')
  if (record.testament !== expectedTestament) {
    throw new Error(`The selected testament is ${expectedTestament === 'Greek' ? 'New Testament (Greek)' : 'Old Testament (Hebrew)'}, but the AI returned ${record.testament}. Select the matching testament and try again.`)
  }
  if (!Array.isArray(record.keyScriptures) || !record.keyScriptures.every((item) => typeof item === 'string')) throw new Error('Gemini response keyScriptures must be an array of strings.')
  if (record.searchGroundingSources !== undefined && (!Array.isArray(record.searchGroundingSources) || !record.searchGroundingSources.every((item) => typeof item === 'string'))) {
    throw new Error('Gemini response searchGroundingSources must be an array of URLs.')
  }
  const responseSources = Array.isArray(record.searchGroundingSources)
    ? record.searchGroundingSources as string[]
    : []
  const providedSources = actualSources.length ? actualSources : responseSources
  const grounding = auditSources(providedSources, strictVerification)
  if (strictVerification && (!grounding.results.length || !grounding.meetsThreshold)) {
    throw new Error('Strict verification requires citations from trusted Tier 1–3 sources averaging at least 90/100.')
  }
  return {
    ...(record as unknown as Omit<WordStudy, 'id' | 'userNotes' | 'userTags' | 'isFavorite' | 'updatedAt'>),
    keyScriptures: record.keyScriptures as string[],
    searchGroundingSources: grounding.accepted.map((item) => item.url),
  }
}

export async function generateStudy(
  provider: AiProvider,
  query: string,
  options: { testament: Testament; useSearchGrounding: boolean; strictVerification: boolean; groqApiKey?: string },
): Promise<WordStudy> {
  if (!query.trim()) throw new Error('Enter a word or Strong’s number to study.')
  if (options.useSearchGrounding && provider !== 'gemini') {
    throw new Error('Google Search grounding is currently available only with Gemini.')
  }
  const responseBody = {
    mode: 'study',
    provider,
    query,
    testament: options.testament,
    useSearchGrounding: options.useSearchGrounding,
  }
  const userTurn = [{
    role: 'user' as const,
    content: `Create a historically grounded ${options.testament === 'Greek' ? 'New Testament (Greek)' : 'Old Testament (Hebrew)'} word study for: ${query.trim()}. Set the testament field to "${options.testament}". Return strict JSON only.`,
  }]
  const payload = provider === 'groq' && options.groqApiKey?.trim()
      ? await requestGroqDirect(options.groqApiKey.trim(), PHILOLOGIST_SYSTEM_PROMPT, userTurn, true)
      : await requestProxy(responseBody)
  if (typeof payload.text !== 'string' || !payload.text.trim()) throw new Error('The AI service returned an empty response.')
  const text = payload.text.trim()
  const actualSources = Array.isArray(payload.sources) && payload.sources.every((source) => typeof source === 'string')
    ? payload.sources
    : []
  const generated = validateStudy(extractJson(text), options.testament, options.strictVerification, actualSources)
  return {
    ...generated,
    id: `${generated.strongsNumber.toLowerCase()}-${Date.now()}`,
    userNotes: '',
    userTags: [],
    isFavorite: false,
    updatedAt: Date.now(),
    provenance: 'ai-generated',
  }
}

export type AiProvider = 'gemini' | 'claude' | 'groq' | 'grok'
export type ChatTurn = { role: 'user' | 'assistant'; content: string }

export async function askPhilologist(
  provider: AiProvider,
  messages: ChatTurn[],
  studyContext?: string,
  personalKeys?: { groq?: string },
): Promise<string> {
  const contextualMessages = studyContext
    ? [{ role: 'user' as const, content: `The user is studying this word. Use it as context for their question, but do not assume claims in it are correct:\n${studyContext}` }, ...messages]
    : messages
  const payload = provider === 'groq' && personalKeys?.groq?.trim()
      ? await requestGroqDirect(personalKeys.groq.trim(), CHAT_SYSTEM_PROMPT, contextualMessages, false)
      : await requestProxy({ mode: 'chat', provider, messages: contextualMessages })
  if (typeof payload.text !== 'string' || !payload.text.trim()) throw new Error('The AI service returned an empty response.')
  return payload.text.trim()
}

async function requestProxy(body: Record<string, unknown>): Promise<{ text?: unknown; sources?: unknown }> {
  const response = await fetch('/api/ai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  let payload: { text?: unknown; sources?: unknown; error?: unknown; offlineFallbackAvailable?: unknown }
  try {
    payload = await response.json() as typeof payload
  } catch {
    if (!response.ok) throw new AiRequestError(`AI request failed (${response.status}).`, response.status)
    throw new Error('The AI service returned an invalid response.')
  }
  if (!response.ok) {
    throw new AiRequestError(
      typeof payload.error === 'string' ? payload.error : `AI request failed (${response.status}).`,
      response.status,
      payload.offlineFallbackAvailable === true,
    )
  }
  return payload
}

async function requestGroqDirect(
  apiKey: string,
  system: string,
  turns: ChatTurn[],
  jsonMode: boolean,
): Promise<{ text?: unknown; sources?: unknown }> {
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [{ role: 'system', content: system }, ...turns],
      temperature: 0.2,
      max_tokens: 4096,
      ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
    }),
  })
  if (!response.ok) throw new Error(await readProviderError(response, 'Groq', apiKey))
  const result = await response.json() as {
    choices?: Array<{ message?: { content?: unknown } }>
  }
  const text = result.choices?.[0]?.message?.content
  return { text: typeof text === 'string' ? text : '' }
}

async function readProviderError(response: Response, provider: string, apiKey: string): Promise<string> {
  try {
    const payload = await response.json() as { error?: { message?: unknown } }
    const message = payload.error?.message
    if (typeof message === 'string' && message.trim()) {
      return `${provider} request failed (${response.status}): ${message.trim().slice(0, 500).replaceAll(apiKey, '[redacted]')}`
    }
  } catch {
    // Fall through to a status-only error for non-JSON provider responses.
  }
  return `${provider} request failed (${response.status}).`
}
