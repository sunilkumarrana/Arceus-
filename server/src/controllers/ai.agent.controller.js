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

const GREETING_TEXT = "Hello sir, how can I help you with?";
const ALL_VOICES = ["Zephyr", "Kore", "Puck", "Charon", "Fenrir"];
const VALID_VOICES = new Set(ALL_VOICES);

// In-memory 5-minute catalog cache to eliminate Cloud SQL latency on every voice turn
let cachedSchemes = null;
let cachedSchemesAt = 0;
const SCHEMES_CACHE_TTL_MS = 5 * 60 * 1000;

// In-memory short-phrase TTS cache (pre-warmed on server boot for instant greetings)
const ttsClipCache = new Map();
const MAX_TTS_CACHE_ITEMS = 40;

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
  required: ["scheme_name", "brief_description", "eligibility", "application_process", "benefits"],
};

const eligibilityQuestionSchema = {
  type: Type.OBJECT,
  properties: {
    id: { type: Type.STRING },
    question: {
      type: Type.STRING,
      description:
        "Clear, direct eligibility question derived directly from the matched schemes' actual criteria so the user can answer easily by voice or click.",
    },
    options: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description:
        "2 to 4 concise answer options for this question (e.g., ['Yes', 'No', 'In progress']).",
    },
  },
  required: ["id", "question", "options"],
};

const schemeEligibilityAssessmentSchema = {
  type: Type.OBJECT,
  properties: {
    schemeName: { type: Type.STRING },
    status: {
      type: Type.STRING,
      description: "One of: 'eligible', 'partially_eligible', 'not_eligible'",
    },
    summary: {
      type: Type.STRING,
      description: "One short sentence summarizing whether and why the user qualifies.",
    },
    checks: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          criterion: { type: Type.STRING },
          met: {
            type: Type.STRING,
            description: "One of: 'yes', 'no', 'check'",
          },
        },
        required: ["criterion", "met"],
      },
    },
  },
  required: ["schemeName", "status", "summary"],
};

const agentResponseSchema = {
  type: Type.OBJECT,
  properties: {
    stage: {
      type: Type.STRING,
      description:
        "Must be one of: 'chat' (greetings/mic checks), 'ask_eligibility' (initial scheme discovery: show all matching schemes and ask scheme-specific eligibility questions before proceeding to full details), or 'show_details' (user answered eligibility questions or asked to proceed directly with full scheme details and eligibility criteria).",
    },
    reply: {
      type: Type.STRING,
      description: "Clear, citizen-friendly plain-text response.",
    },
    spokenSummary: {
      type: Type.STRING,
      description:
        "Crisp, warm spoken voice reply in 2 to 3 short natural sentences (under 42 words, plain speech with NO markdown, asterisks, bullets, or URLs). In 'ask_eligibility' stage, briefly name the top matching schemes and clearly ask the key eligibility questions so the user knows what to answer. In 'show_details' stage, announce which schemes match their eligibility and note that full eligibility criteria and application steps are now displayed.",
    },
    matchedSchemeIds: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "Up to 4 exact matching scheme id strings from the provided catalog.",
    },
    liveSchemes: {
      type: Type.ARRAY,
      items: liveSchemeItemSchema,
      description:
        "Up to 3 additional real Indian government schemes/grants (e.g. NIDHI-PRAYAS, MeitY SAMRIDH, BIRAC BIG, TIDE 2.0, state grants) with full eligibility[], application_process[], benefits[], documents_required[], and official_url so the user sees ALL relevant schemes for their query without duplicating catalog schemes.",
    },
    eligibilityQuestions: {
      type: Type.ARRAY,
      items: eligibilityQuestionSchema,
      description:
        "When stage is 'ask_eligibility', provide 3 to 4 crisp, scheme-specific eligibility questions derived from the matched schemes' criteria so the user can answer them to check eligibility and proceed to full details.",
    },
    eligibilityAssessments: {
      type: Type.ARRAY,
      items: schemeEligibilityAssessmentSchema,
      description:
        "When stage is 'show_details', provide one eligibility assessment entry per matched scheme evaluating the user's answers against that scheme's criteria.",
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
  required: ["stage", "reply", "spokenSummary", "matchedSchemeIds"],
};

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
    { maxAttempts: 2, baseDelayMs: 200 }
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

  if (cleanedText.length <= 150) {
    if (ttsClipCache.size >= MAX_TTS_CACHE_ITEMS) {
      const oldestKey = ttsClipCache.keys().next().value;
      ttsClipCache.delete(oldestKey);
    }
    ttsClipCache.set(cacheKey, result);
  }

  return result;
}

/**
 * Called once on Express server boot (inside app.listen) to warm PostgreSQL catalog cache
 * and pre-synthesize the default greeting voice so greeting playback is instant (< 0.3s)
 * without exhausting per-minute TTS rate limits.
 */
export async function prewarmAgentRuntime() {
  try {
    await getCachedSchemes();
  } catch (err) {
    console.warn("Prewarm schemes cache skipped:", err?.message || err);
  }

  if (!process.env.GEMINI_API_KEY) return;

  try {
    await synthesizeSpeech(GREETING_TEXT, "Zephyr");
  } catch (err) {
    console.warn("Prewarm default greeting TTS skipped:", err?.message || err);
  }
}

function isPurelyConversationalQuery(query) {
  const q = String(query || "").trim().toLowerCase();
  if (!q) return true;
  if (q.length > 75) return false;
  return /^(hi|hello|hey|namaste|good morning|good afternoon|good evening|can you hear me|can you hear me right now|are you there|are you listening|who are you|what can you do|thank you|thanks|ok|okay|testing|test|mic check)[\s?.!]*$/i.test(
    q
  );
}

function asksForLiveUpdate(query) {
  return /\b(latest|new|2025|2026|current|deadline|recent|announced|updated|today|live)\b/i.test(
    String(query || "")
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
    grand: ["grant", "seed", "subsidy", "fund", "funding", "startup"],
    grands: ["grant", "seed", "subsidy", "fund", "funding", "startup"],
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

function attachAssessmentsToSchemes(schemes, assessments) {
  if (!Array.isArray(assessments) || assessments.length === 0) return schemes;

  return schemes.map((scheme) => {
    const schemeNameLower = String(scheme.scheme_name || "").toLowerCase();
    const match = assessments.find((a) => {
      const aName = String(a?.schemeName || "").toLowerCase();
      if (!aName) return false;
      return (
        aName === schemeNameLower ||
        schemeNameLower.includes(aName) ||
        aName.includes(schemeNameLower)
      );
    });

    if (!match) return scheme;
    return {
      ...scheme,
      eligibilityAssessment: {
        status: ["eligible", "partially_eligible", "not_eligible"].includes(match.status)
          ? match.status
          : "partially_eligible",
        summary: match.summary || "",
        checks: Array.isArray(match.checks) ? match.checks : [],
      },
    };
  });
}

export const aiAgentChatController = async (req, res) => {
  const {
    message,
    history = [],
    includeAudio = false,
    voiceName = "Zephyr",
    activeSchemes = [],
    pendingQuestions = [],
    eligibilityAnswers = null,
  } = req.body || {};

  if (!message || !String(message).trim()) {
    return res.status(400).json({
      success: false,
      message: "Please enter or speak a question.",
    });
  }

  const trimmedMessage = String(message).trim();
  const hasPendingEligibilityCheck =
    (Array.isArray(pendingQuestions) && pendingQuestions.length > 0 && Array.isArray(activeSchemes) && activeSchemes.length > 0) ||
    Boolean(eligibilityAnswers && Object.keys(eligibilityAnswers).length > 0);
  const isConversational = !hasPendingEligibilityCheck && isPurelyConversationalQuery(trimmedMessage);

  try {
    const [allSchemes, savedProfileRow] = await Promise.all([
      getCachedSchemes(),
      req.user?.uid ? getUserProfileByUid(req.user.uid) : Promise.resolve(null),
    ]);

    const preMatched = !isConversational ? findKeywordMatchedSchemes(trimmedMessage, allSchemes) : [];
    const preMatchedIds = new Set(preMatched.map((s) => String(s._id)));

    // Only hit live web search when needed (uncataloged topic or explicitly asking for latest/2026 updates), capped at 650ms
    const needsLiveSearch =
      !isConversational &&
      !hasPendingEligibilityCheck &&
      (preMatched.length === 0 || asksForLiveUpdate(trimmedMessage));
    const liveWebResult = needsLiveSearch
      ? await generateLiveSearchContext(trimmedMessage, 650)
      : null;

    const compactCatalog = allSchemes.map((s) => {
      const base = `${s._id} | ${s.scheme_name} (${s.state || "Central"}) [${(s.categories || []).join(", ")}]`;
      if (preMatchedIds.has(String(s._id))) {
        const ben = (s.benefits || []).slice(0, 2).join("; ");
        const elig = (s.eligibility || []).slice(0, 3).join("; ");
        return `${base} — Benefits: ${ben} | Eligibility: ${elig}`;
      }
      return base;
    });

    const activeSchemesBlock =
      Array.isArray(activeSchemes) && activeSchemes.length > 0
        ? `\nCurrently Shown Schemes Under Eligibility Check:\n${activeSchemes
            .map(
              (s) =>
                `- ${s.scheme_name} (id: ${s._id}) | Eligibility: ${(s.eligibility || [])
                  .slice(0, 4)
                  .join("; ")}`
            )
            .join("\n")}\n`
        : "";

    const pendingQuestionsBlock =
      Array.isArray(pendingQuestions) && pendingQuestions.length > 0
        ? `\nEligibility Questions Previously Asked To User:\n${pendingQuestions
            .map((q, i) => `${i + 1}. ${q.question}`)
            .join("\n")}\n`
        : "";

    const answersBlock =
      eligibilityAnswers && typeof eligibilityAnswers === "object"
        ? `\nStructured Eligibility Answers Provided by User:\n${JSON.stringify(eligibilityAnswers)}\n`
        : "";

    const recentHistory = Array.isArray(history)
      ? history
          .slice(-4)
          .map((m) => `${m.role === "assistant" ? "A" : "U"}: ${String(m.content || "").slice(0, 160)}`)
          .join("\n")
      : "";

    const savedAnswers = savedProfileRow?.answers || {};
    const hasProfile = Object.keys(savedAnswers).length > 0;

    const liveContextBlock = liveWebResult?.summary
      ? `\nLive Web Facts:\n${liveWebResult.summary}\n`
      : "";

    const prompt = `${hasProfile ? `Saved Profile: ${JSON.stringify(savedAnswers)}\n` : ""}Catalog (id | name):
${compactCatalog.join("\n")}
${activeSchemesBlock}${pendingQuestionsBlock}${answersBlock}${liveContextBlock}${recentHistory ? `History:\n${recentHistory}\n` : ""}Latest User Message: ${trimmedMessage}`;

    const aiResult = await generateGeminiJson({
      systemInstruction: `You are GovtCompass AI, an ultra-responsive Indian government scheme voice advisor with a structured 2-step eligibility guidance workflow.

WORKFLOW RULES:
1. STAGE "chat" — Pure greetings or mic checks (e.g. "Can you hear me right now?", "Hello"):
   - Reply warmly in 1 short sentence, stage: "chat", matchedSchemeIds: [], liveSchemes: [], eligibilityQuestions: [].

2. STAGE "ask_eligibility" — Whenever the user asks to discover/list government schemes for a topic (e.g., "Tell me the government schemes for startup grants", "scholarships for students", "farmer subsidies", "women business loans") AND has NOT yet answered the eligibility questions:
   - Set stage: "ask_eligibility".
   - Show ALL relevant Indian government schemes for that topic:
     * Include all matching exact catalog IDs in matchedSchemeIds.
     * ALSO include up to 3 well-known real Indian government schemes/grants not in the catalog via liveSchemes (for example, for startup grants, in addition to Startup India Seed Fund Scheme from the catalog, include real Indian grants like DST NIDHI-PRAYAS Grant, MeitY SAMRIDH Scheme, and BIRAC Biotechnology Ignition Grant with full eligibility[], application_process[], benefits[], documents_required[], and official .gov.in URLs).
   - Generate 3 to 4 crisp, direct, scheme-specific questions in "eligibilityQuestions" derived directly from the eligibility rules of those matched schemes (each with 2 to 4 short clickable options), phrased so the user can easily answer by voice OR tap.
   - In "spokenSummary" (2 to 3 crisp sentences, under 42 words, plain speech with NO markdown/URLs), briefly state the matching schemes found and ask the user the key eligibility questions naturally so they can answer right away to see full eligibility details.

3. STAGE "show_details" — Whenever the user answers the eligibility questions (either via voice reply to pending questions OR via Structured Eligibility Answers) OR explicitly asks to proceed directly with scheme details/application steps:
   - Set stage: "show_details".
   - Keep/return all relevant matched schemes (matching catalog IDs and/or preserving the schemes currently under eligibility check).
   - Provide "eligibilityAssessments" for EACH matched scheme evaluating the user's answers (status: 'eligible' | 'partially_eligible' | 'not_eligible', concise summary, and checks[] showing each key criterion as 'yes' | 'no' | 'check').
   - Set eligibilityQuestions: [].
   - In "spokenSummary" (2 to 3 crisp sentences, under 42 words, plain speech), tell the user which schemes they are eligible for and let them know the complete eligibility criteria, documents, and application steps are now displayed on screen.

4. Never invent catalog IDs. If the user asks about a brand-new scheme category while previous questions were pending, switch cleanly to stage "ask_eligibility" for the new category. Match the user's language (English, Hindi, or Hinglish).`,
      prompt,
      responseSchema: agentResponseSchema,
    });

    const schemeMap = new Map(allSchemes.map((s) => [String(s._id), s]));
    const matchedIds = Array.isArray(aiResult.matchedSchemeIds)
      ? aiResult.matchedSchemeIds.map(String)
      : [];

    let matchedSchemes = matchedIds.map((id) => schemeMap.get(id)).filter(Boolean);

    if (matchedSchemes.length === 0 && !isConversational && !hasPendingEligibilityCheck && preMatched.length > 0) {
      matchedSchemes = preMatched.slice(0, 4);
    }

    // Merge live schemes returned by Gemini
    if (Array.isArray(aiResult.liveSchemes) && aiResult.liveSchemes.length > 0) {
      const existingNames = new Set(
        matchedSchemes.map((s) => String(s.scheme_name || "").toLowerCase())
      );
      const extraCards = aiResult.liveSchemes
        .slice(0, 3)
        .map((item, idx) => normalizeLiveSchemeCard(item, idx))
        .filter((card) => card && !existingNames.has(card.scheme_name.toLowerCase()));
      matchedSchemes = [...matchedSchemes, ...extraCards];
    }

    // If evaluating eligibility for currently displayed schemes (Step 2), preserve any activeSchemes (including Step 1 liveSchemes)
    const resolvedStage = ["chat", "ask_eligibility", "show_details"].includes(aiResult.stage)
      ? aiResult.stage
      : hasPendingEligibilityCheck
        ? "show_details"
        : matchedSchemes.length > 0
          ? "ask_eligibility"
          : "chat";

    if (resolvedStage === "show_details" && Array.isArray(activeSchemes) && activeSchemes.length > 0) {
      const existingNames = new Set(
        matchedSchemes.map((s) => String(s.scheme_name || "").toLowerCase())
      );
      const preserved = activeSchemes.filter(
        (s) => s?.scheme_name && !existingNames.has(String(s.scheme_name).toLowerCase())
      );
      matchedSchemes = [...matchedSchemes, ...preserved];
    }

    // Attach personalized eligibility verdicts & per-criterion checks in Stage 2
    if (resolvedStage === "show_details") {
      matchedSchemes = attachAssessmentsToSchemes(
        matchedSchemes,
        aiResult.eligibilityAssessments
      );
    }

    // Normalize eligibility questions for Stage 1
    let eligibilityQuestions = [];
    if (resolvedStage === "ask_eligibility") {
      eligibilityQuestions = Array.isArray(aiResult.eligibilityQuestions)
        ? aiResult.eligibilityQuestions
            .filter((q) => q && q.question)
            .slice(0, 4)
            .map((q, idx) => ({
              id: q.id || `eq-${idx + 1}`,
              question: String(q.question).trim(),
              options:
                Array.isArray(q.options) && q.options.length > 0
                  ? q.options.map((o) => String(o).trim()).filter(Boolean).slice(0, 4)
                  : ["Yes", "No", "Not sure"],
            }))
        : [];
    }

    const finalStage =
      resolvedStage === "ask_eligibility" && eligibilityQuestions.length === 0
        ? "show_details"
        : resolvedStage;

    // Persist profile updates in background (non-blocking)
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
      stage: finalStage,
      reply: aiResult.reply,
      spokenSummary: spokenText,
      matchedSchemes,
      eligibilityQuestions,
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

export const aiSpeakStreamController = async (req, res) => {
  const { text, voiceName = "Zephyr" } = req.body || {};
  const cleanedText = cleanTextForSpeech(text);

  if (!cleanedText) {
    return res.status(400).json({
      success: false,
      message: "Text is required for speech generation.",
    });
  }

  try {
    const audioResult = await synthesizeSpeech(cleanedText, voiceName);
    const wavBuf = Buffer.from(audioResult.audioBase64, "base64");
    const pcmBuf =
      wavBuf.length > 44 && wavBuf.subarray(0, 4).toString("ascii") === "RIFF"
        ? wavBuf.subarray(44)
        : wavBuf;

    res.status(200);
    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader("X-Audio-Sample-Rate", "24000");
    res.setHeader("X-Voice-Name", audioResult.voiceName);
    res.setHeader("Cache-Control", "no-store");
    return res.end(pcmBuf);
  } catch (err) {
    console.error("AI speak stream error:", err);
    return res.status(err?.statusCode || 503).json({
      success: false,
      message: formatFriendlyGeminiError(err),
    });
  }
};
