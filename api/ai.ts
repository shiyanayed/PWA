import type { VercelRequest } from '@vercel/node'

type AiProxyRequest = Pick<VercelRequest, 'method'> & {
  headers?: Record<string, string | string[] | undefined>
  body?: Record<string, unknown> & {
    systemInstruction?: string | { parts?: Array<{ text?: string }> }
  }
}

type AiProxyResponse = {
  setHeader(name: string, value: string): void
  status(code: number): {
    json(value: unknown): void
    end(): void
  }
}

export const maxDuration = 60;

const CANDIDATE_MODELS = [
  "gemini-2.0-flash",
  "gemini-1.5-flash",
  "gemini-2.0-flash-lite"
];

export default async function handler(req: AiProxyRequest, res: AiProxyResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "*");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "GEMINI_API_KEY is missing in Vercel settings." });
  }

  const body = req.body || {};
  let contents = body.contents;
  if (!contents) {
    const rawPrompt = body.prompt || body.message || body.query;
    contents = [{ role: "user", parts: [{ text: typeof rawPrompt === "string" ? rawPrompt : JSON.stringify(body) }] }];
  }

  // Instruct Gemini to use single quotes inside strings so JSON never breaks
  const strictJsonDirective = `
IMPORTANT JSON FORMATTING RULES:
1. You must respond with a single valid JSON object only.
2. Do not wrap the JSON in markdown code blocks like \`\`\`json.
3. NEVER use unescaped double quotes (") inside your explanations, sentences, or definitions. Always use single quotes (') for quoted terms, foreign words, and book titles (e.g., 'logos', 'patronage', 'Romans 8:15').
`;

  let systemInstruction = body.systemInstruction;
  if (typeof systemInstruction === "string") {
    systemInstruction = { parts: [{ text: systemInstruction + "\n" + strictJsonDirective }] };
  } else if (systemInstruction?.parts?.[0]?.text) {
    systemInstruction.parts[0].text += "\n" + strictJsonDirective;
  } else {
    systemInstruction = { parts: [{ text: strictJsonDirective }] };
  }

  const payload = {
    contents,
    systemInstruction,
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.2
    }
  };

  let lastFailure: any = null;

  for (const model of CANDIDATE_MODELS) {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const responseText = await response.text();

      if (response.ok) {
        const rawJson = JSON.parse(responseText);
        let textOutput = rawJson.candidates?.[0]?.content?.parts?.[0]?.text || "{}";

        // 1. Clean markdown fences
        textOutput = textOutput.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();

        // 2. Extract outermost { ... }
        const first = textOutput.indexOf("{");
        const last = textOutput.lastIndexOf("}");
        if (first !== -1 && last !== -1 && last > first) {
          textOutput = textOutput.slice(first, last + 1);
        }

        // 3. Fix unescaped control chars / newlines in strings
        const sanitized = textOutput.replace(/[\x00-\x1f]/g, (c: string) => {
          if (c === "\n") return "\\n";
          if (c === "\r") return "\\r";
          if (c === "\t") return "\\t";
          return "";
        });

        const parsedStudy = JSON.parse(sanitized);

        // Return parsed study object directly
        return res.status(200).json({
          success: true,
          study: parsedStudy,
          text: sanitized,
          ...parsedStudy
        });
      }

      console.warn(`[api/ai] ${model} failed with ${response.status}:`, responseText);
      lastFailure = { model, status: response.status, body: responseText };
    } catch (err: any) {
      lastFailure = { model, error: err.message };
    }
  }

  return res.status(500).json({
    error: "AI model call failed.",
    details: lastFailure
  });
}