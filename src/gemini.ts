import type { WordStudy } from './types'
import type { Testament } from './types'
import { auditSources } from './trust'
import { CHAT_SYSTEM_PROMPT, PHILOLOGIST_SYSTEM_PROMPT } from './prompts'

export { PHILOLOGIST_SYSTEM_PROMPT }

export const GEMINI_MODEL = 'gemini-3.8-flash'

function extractJson(text: string): unknown {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  try {
    return JSON.parse(cleaned) as unknown
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
  options: { testament: Testament; useSearchGrounding: boolean; strictVerification: boolean; geminiApiKey?: string },
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
  const payload = provider === 'gemini' && options.geminiApiKey?.trim()
    ? await requestGeminiDirect(options.geminiApiKey.trim(), PHILOLOGIST_SYSTEM_PROMPT, [{ role: 'user', content: `Create a historically grounded ${options.testament === 'Greek' ? 'New Testament (Greek)' : 'Old Testament (Hebrew)'} word study for: ${query.trim()}. Set the testament field to "${options.testament}". Return strict JSON only.` },], true, options.useSearchGrounding)
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

export async function askPhilologist(provider: AiProvider, messages: ChatTurn[], studyContext?: string, geminiApiKey?: string): Promise<string> {
  const contextualMessages = studyContext
    ? [{ role: 'user' as const, content: `The user is studying this word. Use it as context for their question, but do not assume claims in it are correct:\n${studyContext}` }, ...messages]
    : messages
  const payload = provider === 'gemini' && geminiApiKey?.trim()
    ? await requestGeminiDirect(geminiApiKey.trim(), CHAT_SYSTEM_PROMPT, contextualMessages, false, false)
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
  if (!response.ok) throw new Error(await readError(response))
  return await response.json() as { text?: unknown; sources?: unknown }
}

async function requestGeminiDirect(
  apiKey: string,
  system: string,
  turns: ChatTurn[],
  jsonMode: boolean,
  useSearchGrounding: boolean,
): Promise<{ text?: unknown; sources?: unknown }> {
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: system }] },
      contents: turns.map((turn) => ({
        role: turn.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: turn.content }],
      })),
      generationConfig: {
        ...(jsonMode ? { responseMimeType: 'application/json' } : {}),
        temperature: 0.2,
        maxOutputTokens: 4096,
      },
      ...(useSearchGrounding ? { tools: [{ google_search: {} }] } : {}),
    }),
  })
  if (!response.ok) throw new Error(await readGeminiError(response, apiKey))
  const result = await response.json() as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: unknown }> }
      groundingMetadata?: { groundingChunks?: Array<{ web?: { uri?: unknown } }> }
    }>
  }
  const candidate = result.candidates?.[0]
  return {
    text: candidate?.content?.parts?.map((part) => typeof part.text === 'string' ? part.text : '').join(''),
    sources: candidate?.groundingMetadata?.groundingChunks?.flatMap((chunk) =>
      typeof chunk.web?.uri === 'string' ? [chunk.web.uri] : [],
    ) ?? [],
  }
}

async function readGeminiError(response: Response, apiKey: string): Promise<string> {
  try {
    const payload = await response.json() as { error?: { message?: unknown } }
    const message = payload.error?.message
    if (typeof message === 'string' && message.trim()) {
      return `Gemini request failed (${response.status}): ${message.trim().slice(0, 500).replaceAll(apiKey, '[redacted]')}`
    }
  } catch {
    // Fall through to a status-only error for non-JSON provider responses.
  }
  return `Gemini request failed (${response.status}).`
}

async function readError(response: Response): Promise<string> {
  try {
    const payload = await response.json() as { error?: unknown }
    if (typeof payload.error === 'string') return payload.error
  } catch {
    // Use the status below when the proxy response is not JSON.
  }
  return `AI request failed (${response.status}).`
}
