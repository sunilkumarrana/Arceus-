import { GoogleGenAI, Type, ThinkingLevel } from "@google/genai";

let aiClient = null;
let aiAlphaClient = null;

// Circuit-breaker for live Google Search grounding if current key hits free-tier 429/403 quota
let searchCooldownUntil = 0;
const SEARCH_COOLDOWN_MS = 10 * 60 * 1000;

function ensureApiKey() {
  if (!process.env.GEMINI_API_KEY) {
    const err = new Error("Gemini API key is not configured on the server.");
    err.statusCode = 503;
    throw err;
  }
  return process.env.GEMINI_API_KEY;
}

export function getGeminiClient() {
  const apiKey = ensureApiKey();

  if (!aiClient) {
    aiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }

  return aiClient;
}

// Required for gemini-3.8-flash-lite-tts speechConfig compatibility
export function getGeminiAlphaClient() {
  const apiKey = ensureApiKey();

  if (!aiAlphaClient) {
    aiAlphaClient = new GoogleGenAI({
      apiKey,
      apiVersion: "v1alpha",
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }

  return aiAlphaClient;
}

export function getGeminiErrorStatus(err) {
  if (typeof err?.status === "number") return err.status;
  if (typeof err?.statusCode === "number") return err.statusCode;
  const msg = String(err?.message || "");
  if (msg.includes("503") || msg.includes("UNAVAILABLE")) return 503;
  if (msg.includes("429") || msg.includes("RESOURCE_EXHAUSTED")) return 429;
  if (msg.includes("403") || msg.includes("PERMISSION_DENIED")) return 403;
  if (msg.includes("400") || msg.includes("INVALID_ARGUMENT")) return 400;
  return 500;
}

export function isRetryableGeminiError(err) {
  const status = getGeminiErrorStatus(err);
  if (status === 503 || status === 500 || status === 502 || status === 504) return true;
  const msg = String(err?.message || "").toLowerCase();
  return (
    msg.includes("high demand") ||
    msg.includes("unavailable") ||
    msg.includes("overloaded") ||
    msg.includes("timeout") ||
    msg.includes("econnreset") ||
    msg.includes("fetch failed")
  );
}

export function formatFriendlyGeminiError(err) {
  const status = getGeminiErrorStatus(err);
  const raw = String(err?.message || "");
  if (status === 429 || raw.includes("RESOURCE_EXHAUSTED")) {
    return "Your Gemini API key has reached its current quota limit. You can select a billing-enabled API key in Settings > Secrets for higher limits, or try again shortly.";
  }
  if (status === 403 || raw.includes("PERMISSION_DENIED") || raw.includes("API_KEY_INVALID")) {
    return "The Gemini API key could not be verified. Please check your key in Settings > Secrets.";
  }
  if (status === 503 || raw.includes("UNAVAILABLE")) {
    return "The AI service is momentarily busy. Please tap the orb and ask again.";
  }
  return "Unable to reach the AI advisor right now. Please tap the orb and try again.";
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withGeminiRetry(fn, { maxAttempts = 2, baseDelayMs = 250 } = {}) {
  let lastErr;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await fn(attempt);
    } catch (err) {
      lastErr = err;
      if (attempt < maxAttempts && isRetryableGeminiError(err)) {
        const delay = baseDelayMs * attempt;
        await sleep(delay);
        continue;
      }
      break;
    }
  }
  throw lastErr;
}

function parseJsonResponseText(rawText) {
  const text = String(rawText || "").trim();
  if (!text) {
    throw new Error("Gemini returned an empty response.");
  }

  try {
    return JSON.parse(text);
  } catch {
    const cleaned = text.replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
    return JSON.parse(cleaned);
  }
}

export async function generateGeminiJson({ systemInstruction, prompt, responseSchema }) {
  const ai = getGeminiClient();

  // Ultra-low-latency primary: gemini-3.1-flash-lite (MINIMAL thinking by default -> sub-second JSON).
  // Automatic resilient fallback: gemini-4-hydrogen (LOW thinking).
  const modelPlan = [
    {
      model: "gemini-3.1-flash-lite",
      maxAttempts: 1,
      thinkingConfig: undefined,
    },
    {
      model: "gemini-4-hydrogen",
      maxAttempts: 1,
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
    },
  ];

  let lastErr = null;

  for (const step of modelPlan) {
    try {
      return await withGeminiRetry(
        async () => {
          const config = {
            systemInstruction,
            responseMimeType: "application/json",
          };
          if (step.thinkingConfig) {
            config.thinkingConfig = step.thinkingConfig;
          }
          if (responseSchema) {
            config.responseSchema = responseSchema;
          }

          const response = await ai.models.generateContent({
            model: step.model,
            contents: prompt,
            config,
          });

          return parseJsonResponseText(response.text);
        },
        { maxAttempts: step.maxAttempts, baseDelayMs: 250 }
      );
    } catch (err) {
      lastErr = err;
      console.warn(
        `Gemini JSON call failed on ${step.model} (status ${getGeminiErrorStatus(err)}):`,
        err?.message || err
      );
    }
  }

  const friendlyErr = new Error(formatFriendlyGeminiError(lastErr));
  friendlyErr.statusCode = getGeminiErrorStatus(lastErr) === 429 ? 429 : 503;
  throw friendlyErr;
}

/**
 * Fast, non-blocking live Google Search grounding helper.
 * Caps wait time at 1100ms and backs off automatically on 429/403 so voice responses stay under 2-3s.
 */
export async function generateLiveSearchContext(userQuery, timeoutMs = 1100) {
  const trimmed = String(userQuery || "").trim();
  if (!trimmed) return null;

  if (Date.now() < searchCooldownUntil) {
    return null;
  }

  const ai = getGeminiClient();

  const searchPromise = (async () => {
    try {
      const response = await ai.models.generateContent({
        model: "gemini-3.1-flash-lite",
        contents: `Briefly list latest official Indian government scheme facts, eligibility, application steps, and .gov.in URLs for: "${trimmed}" (max 100 words).`,
        config: {
          tools: [{ googleSearch: {} }],
        },
      });

      const summary = (response.text ?? "").trim();
      const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
      const sources = [];
      const seenUris = new Set();

      for (const chunk of chunks) {
        const uri = chunk?.web?.uri;
        const title = chunk?.web?.title;
        if (uri && !seenUris.has(uri)) {
          seenUris.add(uri);
          sources.push({
            title: title || uri,
            uri,
          });
        }
      }

      if (summary || sources.length > 0) {
        return {
          summary,
          sources: sources.slice(0, 4),
        };
      }
      return null;
    } catch (err) {
      const status = getGeminiErrorStatus(err);
      if (status === 429 || status === 403) {
        searchCooldownUntil = Date.now() + SEARCH_COOLDOWN_MS;
      }
      console.warn(`Live Google Search grounding skipped (status ${status})`);
      return null;
    }
  })();

  const timeoutPromise = new Promise((resolve) => setTimeout(() => resolve(null), timeoutMs));
  return Promise.race([searchPromise, timeoutPromise]);
}

export { Type };
