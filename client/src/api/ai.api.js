import { api } from './api';

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
  { includeAudio = true, voiceName = 'Zephyr' } = {}
) => {
  const response = await api.post('/api/ai/agent', {
    message,
    history,
    includeAudio,
    voiceName,
  });
  return response.data;
};

export const transcribeVoice = async (audioBase64, mimeType = 'audio/webm') => {
  const response = await api.post('/api/ai/transcribe', { audioBase64, mimeType });
  return response.data;
};

export const speakAgentText = async (text, voiceName = 'Zephyr') => {
  const response = await api.post('/api/ai/speak', { text, voiceName });
  return response.data;
};

