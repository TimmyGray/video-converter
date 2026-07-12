const HF_TOKEN_KEY = 'vf_hf_token';

/**
 * Reads the user's Hugging Face token from localStorage. Guarded by `typeof window`
 * so it is safe to call during SSR / static export builds (returns '' there).
 */
export function getHfToken(): string {
  if (typeof window === 'undefined') return '';
  try {
    return window.localStorage.getItem(HF_TOKEN_KEY)?.trim() ?? '';
  } catch {
    // localStorage can throw in privacy modes / disabled storage.
    return '';
  }
}

/** Persists (or clears, when blank) the Hugging Face token in localStorage. */
export function setHfToken(token: string): void {
  if (typeof window === 'undefined') return;
  try {
    const trimmed = token.trim();
    if (trimmed) {
      window.localStorage.setItem(HF_TOKEN_KEY, trimmed);
    } else {
      window.localStorage.removeItem(HF_TOKEN_KEY);
    }
  } catch {
    // Ignore storage failures; hosted transcription simply stays unavailable.
  }
}
