import axios from 'axios';

let authTokenProvider = null;

export const setAuthTokenProvider = (provider) => {
  authTokenProvider = provider;
};

export const getAuthHeaders = async () => {
  const headers = {
    'Content-Type': 'application/json',
    'x-api-key': import.meta.env.VITE_API_KEY || 'GovtCompass-Secret-Key-2026',
  };
  const sessionId = localStorage.getItem('sessionId');
  if (sessionId) {
    headers['X-Session-ID'] = sessionId;
  }
  if (authTokenProvider) {
    try {
      const token = await authTokenProvider();
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }
    } catch {
      // ignore token errors
    }
  }
  return headers;
};

export const api = axios.create({
  // Always use same-origin relative /api/* paths served by our Express server
  baseURL: '',
  headers: {
    'Content-Type': 'application/json',
    'x-api-key': import.meta.env.VITE_API_KEY || 'GovtCompass-Secret-Key-2026',
  },
});

// Attach session ID and Firebase Auth Bearer token on each request
api.interceptors.request.use(async (config) => {
  const sessionId = localStorage.getItem('sessionId');
  if (sessionId) {
    config.headers['X-Session-ID'] = sessionId;
  }

  if (authTokenProvider) {
    try {
      const token = await authTokenProvider();
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    } catch (err) {
      console.warn('Unable to attach auth token:', err);
    }
  }

  return config;
});

// Only clear session state when the backend specifically reports an expired session (not Firebase auth gate)
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;
    const code = error.response?.data?.code;
    const message = error.response?.data?.message || '';

    if (
      status === 401 &&
      code !== 'AUTH_REQUIRED' &&
      code !== 'AUTH_INVALID' &&
      message.toLowerCase().includes('session')
    ) {
      console.warn('Session expired or invalid. Clearing session ID.');
      localStorage.removeItem('sessionId');
      sessionStorage.removeItem('cachedRecommendations');
      sessionStorage.removeItem('cachedRecommendationsPage');
      sessionStorage.removeItem('hasSeenLoading');
    }

    return Promise.reject(error);
  }
);
