import { speakAgentText } from '../api/ai.api';
import { getAuthHeaders } from '../api/api';

export const GREETING_TEXT = 'Hello sir, how can I help you with?';
export const GREETING_TEXT_HI = 'नमस्ते सर, मैं आपकी सरकारी योजनाओं में कैसे मदद कर सकता हूँ?';

export const VOICE_STORAGE_KEY = 'govtcompass_advisor_voice';
export const VOICE_LANG_STORAGE_KEY = 'govtcompass_voice_language';

const VALID_VOICE_IDS = new Set(['Zephyr', 'Kore', 'Puck', 'Charon', 'Fenrir']);
const VALID_LANGS = new Set(['en', 'hi']);

// Client-side memory cache & in-flight deduplication for instant greeting playback
const greetingAudioCache = new Map(); // `${voice}::${lang}` -> { audioBase64, audioMimeType, audioVoice }
const inFlightPrefetches = new Map(); // `${voice}::${lang}` -> Promise

// Client-side cooldown when server reports Gemini TTS free-tier daily quota exhausted
let geminiTtsCooldownUntil = 0;
let geminiTtsQuotaNotice = null;
const CLIENT_TTS_COOLDOWN_MS = 10 * 60 * 1000;

export function isGeminiTtsOnCooldown() {
  return Date.now() < geminiTtsCooldownUntil;
}

export function getGeminiTtsQuotaNotice() {
  return isGeminiTtsOnCooldown() ? geminiTtsQuotaNotice : null;
}

export function markGeminiTtsQuotaExhausted(notice) {
  geminiTtsCooldownUntil = Date.now() + CLIENT_TTS_COOLDOWN_MS;
  geminiTtsQuotaNotice =
    notice ||
    'Gemini TTS daily free-tier limit reached — using built-in browser voice. Select a billing-enabled API key in Settings > Secrets for higher Gemini TTS quota.';
}

export function getSavedAdvisorVoice() {
  try {
    const saved = localStorage.getItem(VOICE_STORAGE_KEY);
    if (saved && VALID_VOICE_IDS.has(saved)) {
      return saved;
    }
  } catch {
    // ignore storage errors
  }
  return 'Zephyr';
}

export function getSavedVoiceLanguage() {
  try {
    const saved = localStorage.getItem(VOICE_LANG_STORAGE_KEY);
    if (saved && VALID_LANGS.has(saved)) {
      return saved;
    }
  } catch {
    // ignore storage errors
  }
  return 'en';
}

export function getGreetingText(lang = 'en') {
  return lang === 'hi' ? GREETING_TEXT_HI : GREETING_TEXT;
}

export function getCachedGreetingAudio(voiceName, lang) {
  const voice = VALID_VOICE_IDS.has(voiceName) ? voiceName : getSavedAdvisorVoice();
  const resolvedLang = VALID_LANGS.has(lang) ? lang : getSavedVoiceLanguage();
  return greetingAudioCache.get(`${voice}::${resolvedLang}`) || null;
}

export function prefetchGreetingAudio(voiceName, lang) {
  if (isGeminiTtsOnCooldown()) {
    return Promise.resolve(null);
  }

  const voice = VALID_VOICE_IDS.has(voiceName) ? voiceName : getSavedAdvisorVoice();
  const resolvedLang = VALID_LANGS.has(lang) ? lang : getSavedVoiceLanguage();
  const key = `${voice}::${resolvedLang}`;

  if (greetingAudioCache.has(key)) {
    return Promise.resolve(greetingAudioCache.get(key));
  }

  if (inFlightPrefetches.has(key)) {
    return inFlightPrefetches.get(key);
  }

  const greetingText = getGreetingText(resolvedLang);

  const promise = getAuthHeaders()
    .then((headers) => {
      if (!headers?.Authorization) {
        return null;
      }
      return speakAgentText(greetingText, voice).then((res) => {
        if (res?.quotaExhausted || res?.useBrowserSpeech) {
          markGeminiTtsQuotaExhausted(res?.quotaNotice);
          return null;
        }
        if (res?.success && res?.audioBase64) {
          const entry = {
            audioBase64: res.audioBase64,
            audioMimeType: res.mimeType || 'audio/wav',
            audioVoice: res.voiceName || voice,
          };
          greetingAudioCache.set(key, entry);
          return entry;
        }
        return null;
      });
    })
    .catch(() => null)
    .finally(() => {
      inFlightPrefetches.delete(key);
    });

  inFlightPrefetches.set(key, promise);
  return promise;
}
