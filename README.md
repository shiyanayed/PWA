# Word Context PWA

Word Context is an offline-oriented progressive web app for studying biblical words in their linguistic, historical, cultural, legal, and literary settings. This repository adapts the Android-focused [Word Context master blueprint](https://github.com/shiyanayed/Word-Context) to a browser and Vercel deployment.

This README documents the implementation that is in this repository, including the actual AI request paths and their failure modes. It is intended to help a developer or another AI agent reproduce, diagnose, and fix problems without assuming that the Android architecture or API configuration applies unchanged to the PWA.

## Contents

- [Product and implementation scope](#product-and-implementation-scope)
- [Quick start](#quick-start)
- [Architecture and important files](#architecture-and-important-files)
- [AI providers and request flow](#ai-providers-and-request-flow)
- [Gemini model cascade](#gemini-model-cascade)
- [Deploying to Vercel](#deploying-to-vercel)
- [Configuring provider keys](#configuring-provider-keys)
- [AI/API troubleshooting](#aiapi-troubleshooting)
- [Offline behavior and local data](#offline-behavior-and-local-data)
- [Features and known gaps against Android](#features-and-known-gaps-against-android)
- [Testing and maintenance](#testing-and-maintenance)

## Product and implementation scope

The app helps users investigate how a biblical word may have functioned in its original language and historical setting. It includes local curated study material, a small Strong's lexicon, AI-generated studies, contextual AI chat, source-domain scoring, and personal study tools.

The PWA is not a complete port of the Android app. Android Room, Retrofit, Jetpack Compose, native share intents, and Android-specific lifecycle behavior have browser equivalents or limitations described below. This repository uses React, TypeScript, Vite, IndexedDB, browser APIs, and a Vercel serverless function.

## Quick start

Requirements: Node.js and npm compatible with the installed Vite/Vitest toolchain.

```sh
npm install
npm run dev
```

`npm run dev` runs the Vite client only. It does **not** run the Vercel API function. The app shell can load locally, but requests to `/api/ai` will not work using Vite alone.

To run the client and Vercel function locally, install or invoke the Vercel CLI and use:

```sh
npx vercel dev
```

Configure the provider environment variables in the Vercel project or its local development environment before expecting proxy requests to succeed. Do not commit local environment files.

Useful commands:

```sh
npm run build
npm test
npm run preview
```

`npm run preview` serves the built client; it is not a replacement for the Vercel function runtime.

## Architecture and important files

```text
api/
  ai.ts                  Vercel serverless endpoint, validation, provider routing, Gemini fallback
src/
  App.tsx                App shell, Study Hub flow, Settings, local fallback presentation
  db.ts                  Dexie database and initial knowledge-base seeding
  data.ts                Curated studies, Strong's entries, and apologetics dossiers
  gemini.ts              Client AI requests, personal-key direct calls, response validation
  gemini-models.ts       Ordered Gemini model candidate list
  offline.ts             Local study/lexicon lookup and lexicon-only fallback construction
  prompts.ts             Philologist and chat system prompts
  trust.ts               Source host scoring and strict source filtering
  types.ts               Core domain and settings types
  *.test.ts              Vitest unit and mocked API tests
vercel.json              Vercel build/output/function configuration
vite.config.ts           Vite, React, and PWA build configuration
```

The production build runs `tsc -b && vite build`, emits the client to `dist`, and generates the PWA service worker and web manifest.

### Data and state

Dexie stores app data in browser IndexedDB database `word-context`. Tables include studies, lexicon entries, dossiers, and settings. Curated seed records are inserted without overwriting user records. Clearing site storage clears this local content and locally saved settings, including an optional personal Groq key. Gemini keys are not stored in browser storage.

The main feature areas are Study Hub, Apologetics, Lexicon, Linguistic Notes, Patristic Archive, Notebook, and Settings. The app supports Old Testament/Hebrew and New Testament/Greek; a Strong's number beginning with `H` or `G` selects the corresponding testament for a search.

## AI providers and request flow

### Provider support

| Provider | Server-side proxy | Personal key in Settings | Configured model |
| --- | --- | --- | --- |
| Gemini | Yes | No | Ordered server-side cascade in [`src/gemini-models.ts`](./src/gemini-models.ts) |
| Claude | Yes | No | `claude-3-5-haiku-latest` |
| Groq | Yes | Yes | `llama-3.3-70b-versatile` |
| Grok (xAI) | Yes | No | `grok-3-mini` |

The exact provider model names and access are determined by the current code and the provider account. A model name in this table or in the fallback list does not mean that the model is enabled for every API key, project, region, or account.

### Server-proxy request path

Gemini studies and chat always send a same-origin JSON `POST` to `/api/ai`. On Vercel this maps to [`api/ai.ts`](./api/ai.ts), which validates the request, reads `GEMINI_API_KEY` from the server environment, and calls Google from the server. The browser never calls the Gemini API directly and never receives the server key. Other providers also use this proxy unless a personal Groq key is configured.

Study request shape:

```json
{
  "mode": "study",
  "provider": "gemini",
  "query": "faith",
  "testament": "Greek",
  "useSearchGrounding": false
}
```

Chat request shape:

```json
{
  "mode": "chat",
  "provider": "gemini",
  "messages": [
    { "role": "user", "content": "How is this word used in this passage?" }
  ]
}
```

Study generation expects valid JSON containing the fields validated in [`src/gemini.ts`](./src/gemini.ts). The client parser can extract JSON from a conversational preamble or Markdown code fence, repair raw control characters and unescaped internal quotes in strings, and then validate the result. A provider returning HTTP 200 does not guarantee a usable study: invalid JSON, missing fields, or a testament mismatch can still cause client-side validation to reject it.

The proxy currently applies these limits and checks:

- HTTP `POST` only.
- Same-origin check; when `APP_ORIGIN` is set, the request `Origin` must match it.
- In-memory best-effort limit of 20 requests per minute per observed IP **per serverless instance**. It is not a durable or globally shared public-service rate limiter.
- Maximum serialized request body of 48,000 bytes.
- Study query length up to 240 characters.
- Chat accepts 1–20 messages, each up to 5,000 characters, and requires the final message to be from the user.
- Provider secrets are read from server environment variables, not `VITE_*` variables.

### Personal Groq-key request path

When a personal Groq key is saved in Settings, Groq requests bypass `/api/ai` and go directly from the browser to Groq. Gemini never uses this direct-key path. Consequently for Groq:

- The corresponding Vercel function log will not contain that request.
- `/api/ai` troubleshooting does not diagnose a direct-provider request; inspect the browser's Network panel and Console instead.
- Browser extensions and scripts running in that browser can access the key. Use this only on a trusted personal device.
- The key is stored in IndexedDB and is not protected like a server-side secret.
- Direct requests remain subject to provider quotas, account/model permissions, network policy, and browser CORS behavior.
- Clear the personal key in Settings and save to route that provider back through the Vercel proxy.

The Vercel Gemini server request uses Google's API URL with a `key` query parameter. Never share API keys, full request headers, or unredacted environment files in a bug report.

### Google Search grounding and source scoring

Google Search grounding is currently supported only for Gemini word-study requests. Grounded source URLs are read from Gemini response metadata. The source-trust layer scores URL hosts and can filter URLs in strict mode; a trusted host score is not proof that an individual claim is supported by that source. Other providers do not inherit Gemini's Search grounding capability.

## Gemini model cascade

The ordered candidate list is used by the Vercel server-side Gemini proxy:

1. `gemini-flash-latest`
2. `gemini-3.5-flash-lite`

These are configured candidate IDs, not a guarantee that each ID is currently available. In particular, API availability may vary by account, project, region, API version, model lifecycle, and feature support. Confirm the exact IDs available to the same Google AI Studio/Google Cloud project as the key when troubleshooting.

The proxy error response on 2026-10-16 reported that `gemini-2.0-flash-lite` had been retired and explicitly recommended `gemini-3.5-flash-lite`; the current cascade therefore uses that replacement first.

The Android blueprint's sample Retrofit endpoint uses `gemini-flash-latest`; the PWA does not call that Android code. Its own candidate list is the source of truth for PWA requests. Changing the Android repository or its key configuration does not change this PWA's Vercel function or browser client.

For each candidate, the client/server makes at most two attempts:

- HTTP 404: treat that candidate as unavailable and move to the next model without waiting.
- HTTP 429, 500, or 503: wait one second, retry that candidate once, then continue to the next candidate if it still fails.
- Network/timeout failure: retry once after one second, then continue.
- Other HTTP errors (for example, an invalid request or rejected key): stop the cascade and report the error rather than treating it as temporary model load.
- HTTP 401/403 responses: stop immediately and report that the key was rejected or access denied; trying another model cannot repair key authorization.

Each upstream attempt has a 60-second fetch timeout. The Vercel function's configured `maxDuration` is also 60 seconds; consequently, long or repeated timeouts may cause the platform to terminate a request before the complete multi-model cascade finishes. Immediate HTTP failures can still advance through the fallback list.

When Search grounding is enabled, the Gemini request includes the Google Search tool and intentionally omits `responseMimeType: "application/json"` because Gemini does not support combining that response mode with the search tool. The prompt still requests strict JSON and the client validates the resulting text against the study schema.

The cascade cannot fix an invalid/restricted API key, exhausted project quota, billing restrictions, disabled API access, unsupported grounding configuration, or a malformed request. The fallback models may also be unavailable to the same key. A fallback success response from the proxy includes the model that answered; the client currently uses the generated text and sources.

When all candidates have transient errors or are unavailable, the request is marked as eligible for the local fallback. A matching bundled Strong's entry may then be shown as **lexicon only**. The fallback is not AI-generated historical interpretation, is not a complete word study, and is not displayed for unrelated errors. If there is no matching bundled entry, the user receives an explicit no-local-entry message instead.

## Deploying to Vercel

1. Import the PWA repository into Vercel and ensure the Vercel project points at the repository root.
2. Use the repository's build command, `npm run build`, and output directory, `dist`. [`vercel.json`](./vercel.json) declares these along with a 60-second maximum duration for `api/ai.ts`.
3. Add the provider environment variables described below in Vercel **Project Settings → Environment Variables**. Select the deployment environments where they should apply (Production, Preview, and/or Development).
4. Set `APP_ORIGIN` to the deployed site's origin when using the server proxy, for example `https://your-domain.example` (scheme and hostname; do not include a path). If using a custom domain, configure the origin users actually visit.
5. Redeploy after adding or changing environment variables. Existing deployments do not automatically receive changed settings.
6. Test the deployed client and function together. The Vite development server or a static preview alone does not exercise the Vercel function.

Keep server-managed credentials only in Vercel's server environment variables. Never add them to source code, README examples, browser `VITE_*` variables, commits, screenshots, or support logs.

### Provider environment variables

| Provider | Vercel environment variable |
| --- | --- |
| Gemini | `GEMINI_API_KEY` |
| Claude | `ANTHROPIC_API_KEY` |
| Groq | `GROQ_API_KEY` |
| Grok (xAI) | `XAI_API_KEY` |

The variable must exist for the Vercel deployment environment being tested. For example, a key configured only for Preview is not available to a Production deployment. Changing a key in Vercel requires a new deployment for the change to take effect.

`APP_ORIGIN` is optional. Without it, the function compares the request `Origin` host with the incoming host. With it, the origin must exactly match the configured origin after URL origin normalization. A mismatch returns HTTP 403 before contacting the provider.

## Configuring provider keys

### Server-side keys (recommended for a controlled deployment)

Set one or more provider environment variables in Vercel. Select the same provider in the app. Gemini always uses this path, keeping its key on the server and routing the browser request through `/api/ai`.

### Personal Groq key

For a personal deployment, a Groq key can be entered in Settings and saved. The client stores it in IndexedDB and sends Groq requests directly to Groq. Gemini has no personal-key input: configure `GEMINI_API_KEY` in Vercel for both word studies and chat.

To troubleshoot Groq or switch it back to the server path:

1. Check whether a personal Groq key is saved.
2. Clear it in Settings and save to route Groq back through the Vercel proxy.
3. Reload and submit a new request.
4. Confirm in the browser Network panel that the request goes to your site's `/api/ai` endpoint.

## AI/API troubleshooting

Start by identifying the request path. Gemini always uses the Vercel proxy. Groq may use either the proxy or a saved personal browser key. The same visible error can have different causes on those paths.

### Find the failing request

In browser developer tools:

1. Open **Network**, enable **Preserve log**, and submit one new study or chat message.
2. Determine whether the request URL is your site's `/api/ai` or a provider host such as `api.groq.com`. Gemini requests should go to `/api/ai`; a Gemini request directly to Google indicates a stale or older client build.
3. Record the HTTP status, response JSON, and request timing. Do not copy API keys or authorization headers.
4. If it is `/api/ai`, inspect the matching Vercel Function log for the same timestamp. Proxy failures log the provider name and a bounded error message.
5. If it is a direct provider URL, inspect the browser Console and that Network response. It will not appear in Vercel function logs.

Also check whether the app opened a saved local study before making a request. A matching local study intentionally opens without calling AI.

### Status and symptom guide

| Symptom / status | Likely causes | Checks and next actions |
| --- | --- | --- |
| No request to `/api/ai`; UI opens a study immediately | A matching saved study was found locally. | Search with a term not already saved if you intend to test the API. |
| `/api/ai` returns 404 or the hosting platform returns HTML | The deployment is serving only the static client, the function was not deployed, or the route is wrong. | Confirm `api/ai.ts` is in the repository root's `api` directory, check Vercel build/deployment output, and test with Vercel CLI rather than `vite` alone. |
| HTTP 405 | The function received a method other than `POST`. | Confirm the client is using the current app build and the request method is `POST`. |
| HTTP 400 | Invalid provider, mode, testament, or message payload. | For studies, select Greek or Hebrew; ensure the query is no longer than 240 characters. For chat, use 1–20 valid turns and end with a user turn. |
| HTTP 403 from `/api/ai` | Request origin was rejected. | Check the browser's actual site origin and `APP_ORIGIN` in Vercel. Remove path segments from `APP_ORIGIN`, use the exact deployed/custom domain origin, and redeploy. |
| HTTP 413 | Serialized request body exceeds 48,000 bytes. | Reduce chat history or message sizes; each chat message is limited to 5,000 characters. |
| `Gemini/Claude/Groq/Grok is not configured on the server` (HTTP 503) | The selected provider's environment variable is missing from this deployment environment. | Check the exact variable spelling, Vercel project, and Production/Preview/Development scope; redeploy after changing it. |
| HTTP 429 with quota/rate-limit detail | Provider rate limit, project quota, billing, or model capacity limit. | Check the provider console for the key's project, quota, billing, and `Retry-After`. The Gemini cascade retries/falls through models but cannot bypass a project-wide quota. |
| HTTP 503 saying Gemini is temporarily unavailable after trying models | Gemini candidates all failed transiently, timed out, or returned 404 model-not-found. | Use Vercel logs to inspect the last provider detail. Verify each configured model ID and key access in the same provider project. Check provider status, API enablement, region, and Search grounding compatibility. |
| HTTP 502 provider could not complete request | A non-retryable upstream error or another provider response failure. | Inspect the Vercel function log and provider-side key/model settings. Do not assume the Gemini cascade applies to Claude, Groq, or Grok. |
| Browser sends Gemini directly to Google instead of `/api/ai` | A stale client bundle or service-worker-cached app is running. | Redeploy the current client, hard-reload, and update/clear the site's service-worker cache. The current source has no browser-direct Gemini path. |
| Direct Groq request reports CORS, DNS, offline, or timeout error | The browser-direct Groq path cannot reach Groq, or Groq rejected the browser origin. | Check Network/Console and provider browser/CORS support. Clear the personal Groq key in Settings to route Groq through the server proxy. |
| Gemini proxy request reports CORS, DNS, offline, or timeout error | The browser cannot reach the deployment or the `/api/ai` function; an origin failure may also be returned as HTTP 403. | Check the site's Network request, Vercel deployment/function logs, and `APP_ORIGIN`. Configure `GEMINI_API_KEY` in the server environment. |
| HTTP 200 but app reports invalid JSON/missing fields | Provider returned content that does not match the strict WordStudy schema. | Inspect the response text without exposing secrets. Check the current prompt and schema validation in `src/gemini.ts`; model fallback only handles HTTP/network failures, not invalid generated content. |
| HTTP 200 but strict verification rejects the study | No acceptable source URLs or the source score threshold was not met. | Try with strict verification disabled to distinguish citation filtering from API transport. Domain score is not claim verification. |
| A lexicon-only entry appears | All Gemini candidate models exhausted eligible transient/unavailable errors and a matching bundled lexicon entry exists. | The entry is local dictionary data, not generated interpretation. If no entry exists, the app reports that limitation rather than inventing a study. |

### How to report a reproducible API failure

For another engineer or AI to diagnose the issue, provide:

- Deployment URL's **origin only** (no tokens or private query strings).
- Whether the failure is on a server-proxy request (`/api/ai`) or direct Groq request.
- Selected provider and, for Groq only, whether a personal key is saved (say only yes/no).
- Whether the operation is a study or chat; for a study, include testament and a non-sensitive test term.
- HTTP status, response JSON with credentials removed, timestamp/time zone, and request duration.
- Relevant Vercel function log lines for proxy calls, with keys and personal data redacted.
- Whether the issue also occurs with Search grounding off and strict verification off.
- Commit/deployment identifier and whether Production, Preview, or local Vercel development is being tested.

Do **not** provide API keys, full `Authorization`/`x-goog-api-key` headers, `.env` files, cookies, or unredacted browser storage.

Suggested investigation prompt for an AI coding assistant:

> Diagnose the failing Word Context PWA AI request from the repository code and the sanitized evidence below. First determine whether the browser uses `/api/ai` or a direct personal-key provider request. Trace that exact path through the UI, client request code, Vercel handler, provider/model configuration, and response handling. Do not assume the Android app's API implementation is used by the PWA. Explain which evidence supports the root cause, distinguish transport/provider errors from client-side JSON/schema/source-verification errors, propose the smallest correct fix, and add or update a regression test. Never ask for or expose API keys.

## Offline behavior and local data

The app can open saved and curated studies, browse the bundled lexicon and dossiers, and store personal notes, tags, favorites, and settings locally. It does not currently provide a complete offline AI model.

Local study lookup is attempted before AI generation. If no saved study matches, AI generation is attempted. Only after an eligible exhausted Gemini cascade may a matching lexicon entry be presented as a `lexicon-fallback` study. This record contains a dictionary gloss and explicit statements that historical, cultural, legal, and theological interpretations are not bundled for that entry.

The bundled Strong's data is a small curated selection, not a complete concordance. A user can import additional lexicon JSON locally. Every entry must include:

```json
{
  "code": "G26",
  "testament": "Greek",
  "lemma": "ἀγάπη",
  "transliteration": "agapē",
  "pronunciation": "ag-ah-pay",
  "definition": "Love",
  "derivation": "From G25",
  "partOfSpeech": "Noun",
  "kjvCount": 116,
  "linkedStudy": "Love"
}
```

`linkedStudy` is optional. Code prefixes must correspond to the testament (`G` for Greek, `H` for Hebrew). Import limits are 12 MB and 20,000 entries. Imported data is stored only in that browser's IndexedDB; review the data license and provenance before importing.

## Features and known gaps against Android

Implemented PWA surfaces and capabilities:

- Testament-aware Study Hub, Strong's lookup, and contextual “Ask AI about this word” chat.
- Curated study, lexicon, and apologetics dossier data persisted in IndexedDB.
- Gemini, Claude, Groq, and Grok provider selection through the server proxy; optional personal Groq direct key. Gemini always uses the server proxy.
- Gemini Google Search grounding for study generation and source-host scoring/filtering.
- Notebook favorites, personal notes and tags; study exports for sermon outline, academic brief, and pocket card.
- Linguistic Notes catalogue, Patristic Archive with source-linked excerpts, onboarding/methodology disclosures, two themes, browser speech, and sharing/copying where supported.
- PWA install/service worker behavior subject to browser support.

Known differences and gaps versus the Android blueprint:

- Android Room is replaced by browser IndexedDB. Clearing browser/site storage removes locally saved data.
- The bundled Strong's entries are not an exhaustive concordance or scholarly dictionary.
- The Patristic Archive contains nine source-linked English excerpts, not the full corpus in the Android specification.
- The Linguistic Notes catalogue currently has five examples; it is not an exhaustive anomaly database and does not label every rare sense or translation difference a contronym.
- AI output and host trust scores are aids, not scholarly fact-checking. Generated citations and interpretations require independent review.
- The PWA has no Android paywall, native Android share sheet, or native Android speech implementation. Browser APIs and their support determine equivalent behavior.
- Provider-native search/grounding is not universal. The current web grounding integration is Gemini-specific.

## Testing and maintenance

Run:

```sh
npm test
npm run build
```

Vitest tests use mocked provider/network responses; they do not prove that a live provider key, model ID, account quota, CORS policy, or Vercel deployment is working. Live provider tests require credentials and should not put secrets in test output or source control.

Relevant tests and implementation:

- `src/api.test.ts`: Vercel handler validation, provider routing, Gemini retries and fallback model selection.
- `src/gemini.test.ts`: client request paths, personal-key cascade, response schema validation, and offline-fallback eligibility.
- `src/features.test.ts`: local lookups, bundled data, lexicon fallback construction, and import validation.
- `api/ai.ts`: server input/origin/rate checks and provider calls.
- `src/gemini.ts`: client proxy/direct requests and generated study validation.
- `src/gemini-models.ts`: Gemini model candidate order.
- `src/App.tsx`: local cache-first lookup and fallback presentation.

When changing provider models, request payloads, response schemas, retry rules, function limits, environment variables, or fallback behavior, update this README and add tests that cover the changed behavior. Keep the deployment documentation synchronized with `vercel.json` and the actual code.
