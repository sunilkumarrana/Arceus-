import { getAllSchemesForMatching } from "../../../src/db/schemes.ts";
import { getUserProfileByUid, upsertUserProfile } from "../../../src/db/users.ts";
import {
  getGeminiClient,
  getGeminiAlphaClient,
  generateGeminiJson,
  generateLiveSearchContext,
  withGeminiRetry,
  formatFriendlyGeminiError,
  getGeminiErrorStatus,
  Type,
} from "../services/gemini.service.js";

// In-memory 5-minute catalog cache to eliminate Cloud SQL latency on every voice turn
let cachedSchemes = null;
let cachedSchemesAt = 0;
const SCHEMES_CACHE_TTL_MS = 5 * 60 * 1000;

// In-memory short-phrase TTS cache (e.g. instant greeting per voice)
const ttsClipCache = new Map();
const MAX_TTS_CACHE_ITEMS = 25;

async function getCachedSchemes() {
  const now = Date.now();
  if (cachedSchemes && now - cachedSchemesAt < SCHEMES_CACHE_TTL_MS) {
    return cachedSchemes;
  }
  const rows = await getAllSchemesForMatching();
  cachedSchemes = rows;
  cachedSchemesAt = now;
  return rows;
}

const liveSchemeItemSchema = {
  type: Type.OBJECT,
  properties: {
    scheme_name: { type: Type.STRING },
    ministry: { type: Type.STRING },
    level: { type: Type.STRING },
    state: { type: Type.STRING },
    application_mode: { type: Type.STRING },
    brief_description: { type: Type.STRING },
    eligibility: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
    application_process: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
    benefits: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
    documents_required: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
    official_url: { type: Type.STRING },
  },
  required: ["scheme_name", "brief_description", "eligibility", "application_process"],
};

const agentResponseSchema = {
  type: Type.OBJECT,
  properties: {
    reply: {
      type: Type.STRING,
      description:
        "Clear, concise citizen-friendly answer explaining matching schemes, eligibility, benefits, and how to apply.",
    },
    spokenSummary: {
      type: Type.STRING,
      description:
        "A crisp, warm spoken voice reply in 2 to 3 short natural sentences (under 45 words, plain speech with NO markdown, asterisks, bullets, or URLs) directly answering the user.",
    },
    matchedSchemeIds: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description:
        "Up to 3 exact matching scheme id strings from the catalog.",
    },
    liveSchemes: {
      type: Type.ARRAY,
      items: liveSchemeItemSchema,
      description:
        "Up to 2 additional real Indian government schemes with eligibility, application_process, benefits, documents_required, and official_url ONLY if not already covered by matchedSchemeIds.",
    },
    extractedProfile: {
      type: Type.OBJECT,
      properties: {
        state: { type: Type.STRING },
        occupation: { type: Type.STRING },
        category: { type: Type.STRING },
        gender: { type: Type.STRING },
        ageRange: { type: Type.STRING },
        incomeRange: { type: Type.STRING },
        goal: { type: Type.STRING },
      },
    },
  },
  required: ["reply", "spokenSummary", "matchedSchemeIds"],
};

const VALID_VOICES = new Set(["Kore", "Zephyr", "Puck", "Charon", "Fenrir"]);

function wrapPcmAsWav(pcmBuffer, sampleRate = 24000, channels = 1, bitsPerSample = 16) {
  const byteRate = (sampleRate * channels * bitsPerSample) / 8;
  const blockAlign = (channels * bitsPerSample) / 8;
  const dataSize = pcmBuffer.length;
  const header = Buffer.alloc(44);

  header.write("RIFF", 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36);
  header.writeUInt32LE(dataSize, 40);

  return Buffer.concat([header, pcmBuffer]);
}

function normalizeAudioPartToWav(audioPart) {
  const base64Data = audioPart?.inlineData?.data;
  if (!base64Data) return null;

  const mimeType = String(audioPart?.inlineData?.mimeType || "").toLowerCase();
  const rawBuffer = Buffer.from(base64Data, "base64");
  if (rawBuffer.length < 16) return null;

  const headerTag = rawBuffer.subarray(0, 4).toString("ascii");
  if (headerTag === "RIFF") {
    return {
      audioBase64: base64Data,
      mimeType: "audio/wav",
    };
  }

  if (mimeType.includes("l16") || mimeType.includes("pcm") || !mimeType.includes("mp3")) {
    const rateMatch = mimeType.match(/rate=(\d+)/i);
    const sampleRate = rateMatch ? Number(rateMatch[1]) || 24000 : 24000;
    const wavBuffer = wrapPcmAsWav(rawBuffer, sampleRate, 1, 16);
    return {
      audioBase64: wavBuffer.toString("base64"),
      mimeType: "audio/wav",
    };
  }

  return {
    audioBase64: base64Data,
    mimeType: mimeType || "audio/wav",
  };
}

function cleanTextForSpeech(text) {
  return String(text || "")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[*#_`~•▪■→↗]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 420);
}

async function synthesizeSpeech(text, voiceName = "Zephyr") {
  const cleanedText = cleanTextForSpeech(text);
  if (!cleanedText) {
    throw new Error("Text is required for speech generation.");
  }

  const chosenVoice = VALID_VOICES.has(voiceName) ? voiceName : "Zephyr";
  const cacheKey = `${chosenVoice}::${cleanedText}`;

  if (ttsClipCache.has(cacheKey)) {
    return ttsClipCache.get(cacheKey);
  }

  // Direct single-shot v1alpha call with prebuiltVoiceConfig (fast ~600-900ms, zero wasted retries)
  const aiAlpha = getGeminiAlphaClient();

  const response = await withGeminiRetry(
    () =>
      aiAlpha.models.generateContent({
        model: "gemini-3.8-flash-lite-tts",
        contents: [
          {
            role: "user",
            parts: [{ text: cleanedText }],
          },
        ],
        config: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: chosenVoice },
            },
          },
        },
      }),
    { maxAttempts: 2, baseDelayMs: 250 }
  );

  const parts = response.candidates?.[0]?.content?.parts || [];
  const audioPart = parts.find((p) => p?.inlineData?.data);
  const normalized = normalizeAudioPartToWav(audioPart);

  if (!normalized) {
    throw new Error("No audio generated by speech model.");
  }

  const result = {
    ...normalized,
    voiceName: chosenVoice,
  };

  // Cache short reusable clips (like greetings & voice previews) for instant replay
  if (cleanedText.length <= 140) {
    if (ttsClipCache.size >= MAX_TTS_CACHE_ITEMS) {
      const oldestKey = ttsClipCache.keys().next().value;
      ttsClipCache.delete(oldestKey);
    }
    ttsClipCache.set(cacheKey, result);
  }

  return result;
}

function isPurelyConversationalQuery(query) {
  const q = String(query || "").trim().toLowerCase();
  if (!q) return true;
  if (q.length > 75) return false;
  return /^(hi|hello|hey|namaste|good morning|good afternoon|good evening|can you hear me|can you hear me right now|are you there|are you listening|who are you|what can you do|thank you|thanks|ok|okay|yes|no|testing|test|mic check)[\s?.!]*$/i.test(
    q
  );
}

function findKeywordMatchedSchemes(query, allSchemes) {
  const q = String(query || "").toLowerCase();
  if (!q) return [];

  const stopWords = new Set([
    "what", "which", "where", "when", "about", "there", "their", "these", "those",
    "would", "could", "should", "please", "hello", "schemes", "scheme", "government",
    "govt", "india", "indian", "apply", "details", "eligibility", "application", "tell",
    "show", "give", "want", "need", "help", "with", "from", "have", "that", "this",
    "for", "the", "and", "are", "can", "you", "how", "hear", "right", "now", "sir",
  ]);

  const synonyms = {
    startup: ["startup", "seed", "entrepreneur", "msme", "mudra", "business", "enterprise"],
    startups: ["startup", "seed", "entrepreneur", "msme", "mudra", "business"],
    grant: ["grant", "seed", "subsidy", "fund", "funding", "startup"],
    grants: ["grant", "seed", "subsidy", "fund", "funding", "startup"],
    farmer: ["farmer", "kisan", "agriculture", "crop", "farming", "fasal"],
    farmers: ["farmer", "kisan", "agriculture", "crop", "farming", "fasal"],
    student: ["student", "scholarship", "education", "college", "tuition", "vidyalakshmi"],
    students: ["student", "scholarship", "education", "college", "tuition"],
    scholarship: ["scholarship", "student", "education", "nsp", "fellowship"],
    women: ["women", "woman", "female", "girl", "beti", "mahila", "sukanya", "stand-up"],
    health: ["health", "medical", "hospital", "ayushman", "insurance", "treatment"],
    housing: ["housing", "home", "house", "awas", "pmay"],
    loan: ["loan", "mudra", "credit", "finance", "funding", "business", "msme"],
    business: ["business", "msme", "mudra", "entrepreneur", "pmegp", "startup", "stand-up"],
    pension: ["pension", "senior", "old age", "atal", "retirement"],
  };

  const rawTokens = q
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !stopWords.has(w));

  if (rawTokens.length === 0) return [];

  const expandedTokens = new Set();
  for (const token of rawTokens) {
    expandedTokens.add(token);
    if (synonyms[token]) {
      synonyms[token].forEach((s) => expandedTokens.add(s));
    }
  }

  return allSchemes
    .map((s) => {
      const haystack = [
        s.scheme_name,
        s.short_title,
        s.ministry,
        s.state,
        s.brief_description,
        ...(s.categories || []),
        ...(s.tags || []),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      let score = 0;
      for (const token of expandedTokens) {
        if (haystack.includes(token)) {
          score += rawTokens.includes(token) ? 3 : 1;
        }
      }
      return { scheme: s, score };
    })
    .filter((item) => item.score >= 3)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)
    .map((item) => item.scheme);
}

function normalizeLiveSchemeCard(item, idx) {
  if (!item || !item.scheme_name) return null;
  const officialUrl =
    typeof item.official_url === "string" && /^https?:\/\//i.test(item.official_url.trim())
      ? item.official_url.trim()
      : null;

  return {
    _id: `live-scheme-${Date.now()}-${idx}`,
    isLive: true,
    scheme_name: String(item.scheme_name).trim(),
    ministry: item.ministry ? String(item.ministry).trim() : "Government of India",
    level: item.level ? String(item.level).trim() : "Central",
    state: item.state ? String(item.state).trim() : "All India",
    application_mode: item.application_mode ? String(item.application_mode).trim() : "Online",
    brief_description: item.brief_description ? String(item.brief_description).trim() : "",
    eligibility: Array.isArray(item.eligibility) ? item.eligibility.filter(Boolean) : [],
    application_process: Array.isArray(item.application_process)
      ? item.application_process.filter(Boolean)
      : [],
    benefits: Array.isArray(item.benefits) ? item.benefits.filter(Boolean) : [],
    documents_required: Array.isArray(item.documents_required)
      ? item.documents_required.filter(Boolean)
      : [],
    references: officialUrl ? [officialUrl] : [],
  };
}

export const aiAgentChatController = async (req, res) => {
  const { message, history = [], includeAudio = true, voiceName = "Zephyr" } = req.body || {};

  if (!message || !String(message).trim()) {
    return res.status(400).json({
      success: false,
      message: "Please enter or speak a question.",
    });
  }

  const trimmedMessage = String(message).trim();
  const isConversational = isPurelyConversationalQuery(trimmedMessage);

  try {
    const [allSchemes, savedProfileRow, liveWebResult] = await Promise.all([
      getCachedSchemes(),
      req.user?.uid ? getUserProfileByUid(req.user.uid) : Promise.resolve(null),
      !isConversational ? generateLiveSearchContext(trimmedMessage, 1100) : Promise.resolve(null),
    ]);

    // Ultra-compact catalog index (~500 tokens total) for fast sub-second Gemini response
    const preMatched = !isConversational ? findKeywordMatchedSchemes(trimmedMessage, allSchemes) : [];
    const preMatchedIds = new Set(preMatched.map((s) => String(s._id)));

    const compactCatalog = allSchemes.map((s) => {
      const base = `${s._id} | ${s.scheme_name} (${s.state || "Central"}) [${(s.categories || []).join(", ")}]`;
      if (preMatchedIds.has(String(s._id))) {
        const ben = (s.benefits || []).slice(0, 2).join("; ");
        const elig = (s.eligibility || []).slice(0, 2).join("; ");
        return `${base} — Benefits: ${ben} | Eligibility: ${elig}`;
      }
      return base;
    });

    const recentHistory = Array.isArray(history)
      ? history
          .slice(-4)
          .map((m) => `${m.role === "assistant" ? "A" : "U"}: ${String(m.content || "").slice(0, 180)}`)
          .join("\n")
      : "";

    const savedAnswers = savedProfileRow?.answers || {};
    const hasProfile = Object.keys(savedAnswers).length > 0;

    const liveContextBlock = liveWebResult?.summary
      ? `\nLive Web Facts:\n${liveWebResult.summary}\n`
      : "";

    const prompt = `${hasProfile ? `User Profile: ${JSON.stringify(savedAnswers)}\n` : ""}Catalog (id | name):
${compactCatalog.join("\n")}
${liveContextBlock}${recentHistory ? `History:\n${recentHistory}\n` : ""}Question: ${trimmedMessage}`;

    const aiResult = await generateGeminiJson({
      systemInstruction: `You are GovtCompass AI, a fast, warm Indian government scheme voice advisor.
Rules:
1. Answer ALL questions directly and concisely:
   - For greetings or mic checks (e.g. "Can you hear me right now?"), reply warmly in 1-2 short sentences with matchedSchemeIds: [] and liveSchemes: [].
   - For ANY government scheme question (startup grants, loans, scholarships, farmers, women, health, housing, pensions, state schemes):
     * Pick up to 3 exact matching catalog IDs in matchedSchemeIds.
     * ONLY if the user asks for schemes not in the catalog, add up to 2 accurate schemes in liveSchemes with concise eligibility[], application_process[], benefits[], documents_required[], and official_url.
     * Keep "spokenSummary" to 2-3 crisp natural spoken sentences (under 45 words, NO markdown/asterisks/URLs) naming the top scheme(s), key benefit, and noting that full eligibility and application steps are displayed on screen.
     * Keep "reply" concise plain text.
2. Never invent catalog IDs. Match user's language (English, Hindi, or Hinglish).`,
      prompt,
      responseSchema: agentResponseSchema,
    });

    const schemeMap = new Map(allSchemes.map((s) => [String(s._id), s]));
    const matchedIds = Array.isArray(aiResult.matchedSchemeIds)
      ? aiResult.matchedSchemeIds.map(String)
      : [];

    let matchedSchemes = matchedIds
      .map((id) => schemeMap.get(id))
      .filter(Boolean);

    if (matchedSchemes.length === 0 && !isConversational && preMatched.length > 0) {
      matchedSchemes = preMatched.slice(0, 3);
    }

    if (Array.isArray(aiResult.liveSchemes) && aiResult.liveSchemes.length > 0) {
      const existingNames = new Set(
        matchedSchemes.map((s) => String(s.scheme_name || "").toLowerCase())
      );
      const extraCards = aiResult.liveSchemes
        .slice(0, 2)
        .map((item, idx) => normalizeLiveSchemeCard(item, idx))
        .filter((card) => card && !existingNames.has(card.scheme_name.toLowerCase()));
      matchedSchemes = [...matchedSchemes, ...extraCards];
    }

    // Persist profile updates in the background (non-blocking so response returns immediately)
    if (req.dbUser?.id && aiResult.extractedProfile && typeof aiResult.extractedProfile === "object") {
      const updates = {};
      for (const [k, v] of Object.entries(aiResult.extractedProfile)) {
        if (typeof v === "string" && v.trim()) {
          updates[k] = v.trim();
        }
      }
      if (Object.keys(updates).length > 0) {
        upsertUserProfile(req.dbUser.id, { ...savedAnswers, ...updates }).catch((profileErr) =>
          console.error("Failed to save extracted profile:", profileErr)
        );
      }
    }

    const spokenText = aiResult.spokenSummary || aiResult.reply;
    let audioBase64 = null;
    let audioMimeType = null;
    let audioVoice = null;
    let audioError = null;

    if (includeAudio && spokenText) {
      try {
        const audioResult = await synthesizeSpeech(spokenText, voiceName);
        audioBase64 = audioResult.audioBase64;
        audioMimeType = audioResult.mimeType;
        audioVoice = audioResult.voiceName;
      } catch (ttsErr) {
        console.error("Inline AI speech synthesis failed:", ttsErr);
        audioError = ttsErr?.message || "Voice audio generation failed.";
      }
    }

    return res.status(200).json({
      success: true,
      reply: aiResult.reply,
      spokenSummary: spokenText,
      matchedSchemes,
      liveSources: liveWebResult?.sources || [],
      audioBase64,
      audioMimeType,
      audioVoice,
      audioError,
    });
  } catch (err) {
    console.error("AI agent chat error:", err);
    return res.status(err?.statusCode || getGeminiErrorStatus(err) || 503).json({
      success: false,
      message: err?.message || formatFriendlyGeminiError(err),
    });
  }
};

export const aiTranscribeController = async (req, res) => {
  const { audioBase64, mimeType = "audio/webm" } = req.body || {};

  if (!audioBase64 || typeof audioBase64 !== "string") {
    return res.status(400).json({
      success: false,
      message: "Audio data is required for transcription.",
    });
  }

  try {
    const ai = getGeminiClient();
    const cleanMime = String(mimeType).split(";")[0].trim() || "audio/webm";
    const audioPart = {
      inlineData: {
        mimeType: cleanMime,
        data: audioBase64,
      },
    };

    const transcribeModels = [
      {
        model: "gemini-3.5-transcribe",
        instruction: "Transcribe speech accurately as plain text. Return only the spoken words.",
      },
      {
        model: "gemini-3.1-flash-lite",
        instruction:
          "Write out exactly what the speaker said as plain text (English, Hindi, or Hinglish). Return ONLY the spoken words or empty string if silent.",
      },
    ];

    let transcript = "";
    let lastErr = null;

    for (const candidate of transcribeModels) {
      try {
        const response = await ai.models.generateContent({
          model: candidate.model,
          contents: {
            parts: [audioPart, { text: candidate.instruction }],
          },
        });
        const text = (response.text ?? "").replace(/^["']|["']$/g, "").trim();
        if (text) {
          transcript = text;
          break;
        }
      } catch (err) {
        lastErr = err;
        console.warn(`Audio transcription failed on ${candidate.model}:`, err?.message || err);
      }
    }

    if (!transcript && lastErr) {
      return res.status(getGeminiErrorStatus(lastErr) === 429 ? 429 : 503).json({
        success: false,
        message: formatFriendlyGeminiError(lastErr),
      });
    }

    return res.status(200).json({
      success: true,
      transcript,
    });
  } catch (err) {
    console.error("AI transcribe error:", err);
    return res.status(err?.statusCode || 503).json({
      success: false,
      message: formatFriendlyGeminiError(err),
    });
  }
};

export const aiSpeakController = async (req, res) => {
  const { text, voiceName = "Zephyr" } = req.body || {};

  if (!text || !String(text).trim()) {
    return res.status(400).json({
      success: false,
      message: "Text is required for speech generation.",
    });
  }

  try {
    // Pre-warm schemes catalog cache in the background while greeting audio is generated
    getCachedSchemes().catch(() => {});
    const audioResult = await synthesizeSpeech(text, voiceName);

    return res.status(200).json({
      success: true,
      audioBase64: audioResult.audioBase64,
      mimeType: audioResult.mimeType,
      voiceName: audioResult.voiceName,
    });
  } catch (err) {
    console.error("AI speak error:", err);
    return res.status(err?.statusCode || 503).json({
      success: false,
      message: formatFriendlyGeminiError(err),
    });
  }
};
