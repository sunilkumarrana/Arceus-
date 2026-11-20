import { api, getAuthHeaders } from './api';

export const explainScheme = async (schemeId) => {
  const response = await api.post('/api/ai/explain', { schemeId });
  return response.data;
};

export const analyzeEligibilityGap = async (schemeId, failedCriteria, profile) => {
  const response = await api.post('/api/ai/eligibility-gap', { schemeId, failedCriteria, profile });
  return response.data;
};

export const intakeProfileFromText = async (freeText) => {
  const response = await api.post('/api/ai/intake', { freeText });
  return response.data;
};

export const refineSchemes = async (query, schemes) => {
  const response = await api.post('/api/ai/refine', { query, schemes });
  return response.data;
};

export const askSchemeAgent = async (
  message,
  history = [],
  {
    includeAudio = false,
    voiceName = 'Zephyr',
    voiceLanguage = 'en',
    activeSchemes = [],
    pendingQuestions = [],
    eligibilityAnswers = null,
  } = {}
) => {
  const response = await api.post('/api/ai/agent', {
    message,
    history,
    includeAudio,
    voiceName,
    voiceLanguage,
    activeSchemes,
    pendingQuestions,
    eligibilityAnswers,
  });
  return response.data;
};

export const transcribeVoice = async (audioBase64, mimeType = 'audio/webm', voiceLanguage = 'en') => {
  const response = await api.post('/api/ai/transcribe', { audioBase64, mimeType, voiceLanguage });
  return response.data;
};

export const speakAgentText = async (text, voiceName = 'Zephyr') => {
  const response = await api.post('/api/ai/speak', { text, voiceName });
  return response.data;
};

export const fetchSpeakStream = async (text, voiceName = 'Zephyr', signal) => {
  const headers = await getAuthHeaders();
  return fetch('/api/ai/speak-stream', {
    method: 'POST',
    headers,
    body: JSON.stringify({ text, voiceName }),
    signal,
  });
};
