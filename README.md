# Word Context PWA

Word Context is an offline-oriented progressive web app for studying biblical language in its historical, cultural, legal, and literary settings. This repository adapts the Android-oriented [Word Context specification](https://github.com/shiyanayed/Word-Context) to browser capabilities.

## Run locally

```sh
npm install
npm run dev
```

The Vite server hosts the client. The AI endpoint is a Vercel serverless function under `api/ai.ts`; run the full deployment runtime locally with the Vercel CLI (`vercel dev`) to test AI requests. `npm run build` validates the client and generates the PWA assets.

## Deploy and configure AI

Deploy with Vercel. Add whichever provider secrets you intend to use as server environment variables:

| Provider | Environment variable |
| --- | --- |
| Google Gemini | `GEMINI_API_KEY` |
| Anthropic Claude | `ANTHROPIC_API_KEY` |
| Groq | `GROQ_API_KEY` |
| xAI Grok | `XAI_API_KEY` |

Set `APP_ORIGIN` to the exact deployed origin (for example, `https://word-context.example`) to restrict requests to that origin. Server-managed keys must never be placed in `VITE_*` variables or committed to source control. The API applies input limits, same-origin checks, a best-effort per-instance rate limit, and upstream timeouts. For a public multi-user deployment, put a durable rate limiter and user authentication in front of the function; per-instance memory limits are not a global abuse-prevention system.

For a personal deployment, a Gemini or Groq key can alternatively be entered in **Settings**. When present, requests for that provider go directly from that browser to Google or Groq rather than through the Vercel function. The key is stored in that browser's IndexedDB and is accessible to anyone or any script/extension running in that browser; use only on a trusted personal device. Clear the key and save settings to return that provider's requests to the Vercel proxy. Direct browser requests do not avoid provider quota limits.

## Current implementation

- React, TypeScript, Vite, Tailwind, and a PWA service worker.
- Dexie/IndexedDB stores curated studies, lexicon entries, dossiers, and preferences locally.
- The Study Hub, Apologetics, Lexicon, Linguistic Notes, Patristic Archive, Notebook, and Settings views are available.
- Study Hub searches let users choose Old Testament (Hebrew) or New Testament (Greek); Strong's `H…`/`G…` queries automatically use the matching testament.
- Gemini 3.8 Flash, Claude, Groq, and Grok can be selected through the AI proxy for both word-study generation and chat; the server needs a secret configured for the chosen provider. Personal Gemini and Groq keys can alternatively be saved in browser settings for direct provider requests.
- Each open word study has an “Ask AI about this word” action that includes the study’s language, Strong's number, lexical gloss, and summary as context for the chat.
- The proxy supports strict-JSON study generation and conversational requests. Gemini can use Google Search grounding for study generation; grounded URLs come from provider response metadata.
- Provider HTTP 429 responses are returned with the provider's bounded error detail and any `Retry-After` delay so quota and rate-limit issues can be diagnosed.
- Local study lookup happens before AI generation. If the server is unavailable but a matching Strong's entry exists, the app can save an explicitly labeled lexicon-only fallback without presenting invented historical context.
- Source host scoring, strict trusted-domain filtering, two themes, favorites, per-study notes, user tags, and tag filtering are implemented.
- The language-notes catalogue covers five source-linked cases: euphemistic usage (H1288), a rare sense (H2617), translation range (G1242), and contextual polysemy (G2205, G5331). Notes appear both in the catalogue and with matching studies; they are not presented as a list of proven contronyms.
- Browser onboarding and methodology disclosures are available. Speech uses browser text-to-speech where supported.
- Nine patristic excerpts link to their cited English translations across the Apostolic, Ante-Nicene, and Nicene eras; copy, Web Share, and clipboard fallback are available.
- Study exports include a sermon outline, academic brief, and pocket card. An imported Strong's JSON pack can be stored locally in IndexedDB.

### Strong's JSON import format

Lexicon import accepts a JSON array. Every entry must include `code`, `testament`, `lemma`, `transliteration`, `pronunciation`, `definition`, `derivation`, `partOfSpeech`, and integer `kjvCount`; `linkedStudy` is optional. The code prefix must match `Greek` (`G…`) or `Hebrew` (`H…`). Imports are limited to 12 MB and 20,000 entries. Review the dataset's license and source before importing; imported data stays local to the browser.

## Specification coverage and known gaps

The Android blueprint includes features that do not have one-to-one browser equivalents. Android Room is represented by IndexedDB; Android share intents should use the Web Share API with clipboard fallback; native speech and installation behavior depend on browser support.

The current PWA is not yet feature-complete against the blueprint. The bundled Strong's entries are a small curated subset, not an exhaustive scholarly dictionary or complete concordance; obtaining and redistributing a genuinely exhaustive, appropriately licensed data pack remains outstanding. The patristic archive currently contains nine source-linked English excerpts, not the complete requested corpus. The language-notes catalogue currently has five examples, not an exhaustive anomaly database; it distinguishes rare senses and contextual polysemy from actual contronyms. Do not treat AI-produced references or domain trust scores as claim verification.

## Validation

```sh
npm run build
npm test
```

`npm test` runs the Vitest suite, including mocked routing checks for all four providers and coverage of the blueprint's named curated word studies. Browser integration and live provider tests require the Vercel function runtime and credentials for the selected provider.
