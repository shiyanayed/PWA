import type { VercelRequest, VercelResponse } from "@vercel/node";

export const maxDuration = 60;

const CANDIDATE_MODELS = [
  "gemini-2.0-flash",
  "gemini-1.5-flash",
  "gemini-2.0-flash-lite"
];

// Strict schema: Gemini's decoder physically CANNOT produce invalid JSON when this is passed
const STUDY_RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    word: { type: "STRING" },
    testament: { type: "STRING" },
    originalWord: { type: "STRING" },
    transliteration: { type: "STRING" },
    strongsNumber: { type: "STRING" },
    literalMeaning: { type: "STRING" },
    rootLemma: { type: "STRING" },
    morphologicalFamilyTable: { type: "STRING" },
    translationDisconnect: { type: "STRING" },
    hasLinguisticAnomaly: { type: "BOOLEAN" },
    anomalyType: { type: "STRING" },
    anomalyRootWord: { type: "STRING" },
    anomalyStrongsNumber: { type: "STRING" },
    anomalyPrimaryMeaning: { type: "STRING" },
    anomalyAlternateMeaning: { type: "STRING" },
    anomalyComparisonTable: { type: "STRING" },
    anomalyWowFactor: { type: "STRING" },
    thenMeaning: { type: "STRING" },
    nowMeaning: { type: "STRING" },
    historicalBackground: { type: "STRING" },
    culturalContext: { type: "STRING" },
    legalDimension: { type: "STRING" },
    theologicalWeight: { type: "STRING" },
    keyScriptures: { type: "ARRAY", items: { type: "STRING" } },
    closingInsight: { type: "STRING" },
    searchGroundingSources: { type: "ARRAY", items: { type: "STRING" } }
  },
  required: ["word", "testament", "literalMeaning", "thenMeaning", "nowMeaning", "historicalBackground"]
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "*");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "GEMINI_API_KEY is not set in Vercel environment variables." });
  }

  const body = req.body || {};
  let contents = body.contents;
  if (!contents) {
    const rawPrompt = body.prompt || body.message || body.query;
    contents = [{ role: "user", parts: [{ text: typeof rawPrompt === "string" ? rawPrompt : "Provide word study" }] }];
  }

  const payload = {
    contents,
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: STUDY_RESPONSE_SCHEMA,
      temperature: 0.2
    }
  };

  let lastError: any = null;

  for (const model of CANDIDATE_MODELS) {
    const cleanModel = model.replace(/^models\//, "");
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${cleanModel}:generateContent?key=${apiKey}`;

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const responseText = await response.text();

      if (response.ok) {
        const rawJson = JSON.parse(responseText);
        const textOutput = rawJson.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
        
        // Parse on the server so the browser gets pure, safe JSON:
        const parsedStudy = JSON.parse(textOutput);

        return res.status(200).json({
          success: true,
          study: parsedStudy,
          data: parsedStudy,
          text: textOutput,
          ...parsedStudy
        });
      }

      lastError = { model: cleanModel, status: response.status, body: responseText };
    } catch (err: any) {
      lastError = { model: cleanModel, error: err.message };
    }
  }

  return res.status(503).json({
    error: "Gemini is temporarily unavailable.",
    diagnostic: lastError
  });
}