import { speakAgentText } from '../api/ai.api';
import { getAuthHeaders } from '../api/api';

export const GREETING_TEXT = 'Hello sir, how can I help you with?';
export const VOICE_STORAGE_KEY = 'govtcompass_advisor_voice';

const VALID_VOICE_IDS = new Set(['Zephyr', 'Kore', 'Puck', 'Charon', 'Fenrir']);

// Client-side memory cache & in-flight deduplication for instant greeting playback
const greetingAudioCache = new Map(); // voiceName -> { audioBase64, audioMimeType, audioVoice }
const inFlightPrefetches = new Map(); // voiceName -> Promise

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

export function getCachedGreetingAudio(voiceName) {
  const voice = VALID_VOICE_IDS.has(voiceName) ? voiceName : getSavedAdvisorVoice();
  return greetingAudioCache.get(voice) || null;
}

export function prefetchGreetingAudio(voiceName) {
  const voice = VALID_VOICE_IDS.has(voiceName) ? voiceName : getSavedAdvisorVoice();

  if (greetingAudioCache.has(voice)) {
    return Promise.resolve(greetingAudioCache.get(voice));
  }

  if (inFlightPrefetches.has(voice)) {
    return inFlightPrefetches.get(voice);
  }

  const promise = getAuthHeaders()
    .then((headers) => {
      // Only prefetch when an authenticated Bearer token is available
      if (!headers?.Authorization) {
        return null;
      }
      return speakAgentText(GREETING_TEXT, voice).then((res) => {
        if (res?.success && res?.audioBase64) {
          const entry = {
            audioBase64: res.audioBase64,
            audioMimeType: res.mimeType || 'audio/wav',
            audioVoice: res.voiceName || voice,
          };
          greetingAudioCache.set(voice, entry);
          return entry;
        }
        return null;
      });
    })
    .catch(() => null)
    .finally(() => {
      inFlightPrefetches.delete(voice);
    });

  inFlightPrefetches.set(voice, promise);
  return promise;
}
