const HF_TOKEN_KEY = 'vf_hf_token';
const OPENROUTER_TOKEN_KEY = 'vf_openrouter_token';

/**
 * Reads the user's Hugging Face token from localStorage. Guarded by `typeof window`
 * so it is safe to call during SSR / static export builds (returns '' there).
 */
export function getHfToken(): string {
  return getToken(HF_TOKEN_KEY);
}

/** Reads the user's OpenRouter API key from localStorage. */
export function getOpenRouterToken(): string {
  return getToken(OPENROUTER_TOKEN_KEY);
}

function getToken(key: string): string {
  if (typeof window === 'undefined') return '';
  try {
    return window.localStorage.getItem(key)?.trim() ?? '';
  } catch {
    // localStorage can throw in privacy modes / disabled storage.
    return '';
  }
}

/** Persists (or clears, when blank) the Hugging Face token in localStorage. */
export function setHfToken(token: string): void {
  setToken(HF_TOKEN_KEY, token);
}

/** Persists (or clears, when blank) the user's OpenRouter API key in localStorage. */
export function setOpenRouterToken(token: string): void {
  setToken(OPENROUTER_TOKEN_KEY, token);
}

function setToken(key: string, token: string): void {
  if (typeof window === 'undefined') return;
  try {
    const trimmed = token.trim();
    if (trimmed) {
      window.localStorage.setItem(key, trimmed);
    } else {
      window.localStorage.removeItem(key);
    }
  } catch {
    // Ignore storage failures; hosted transcription simply stays unavailable.
  }
}
