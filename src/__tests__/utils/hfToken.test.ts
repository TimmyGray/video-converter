import {
  getHfToken,
  getOpenRouterToken,
  setHfToken,
  setOpenRouterToken,
} from '@/utils/hfToken';

describe('hfToken', () => {
  beforeEach(() => window.localStorage.clear());

  it('returns empty string when unset', () => {
    expect(getHfToken()).toBe('');
  });

  it('round-trips a token', () => {
    setHfToken('hf_abc123');
    expect(getHfToken()).toBe('hf_abc123');
  });

  it('trims stored tokens', () => {
    setHfToken('  hf_spaced  ');
    expect(getHfToken()).toBe('hf_spaced');
  });

  it('clears the token when set to blank', () => {
    setHfToken('hf_abc123');
    setHfToken('   ');
    expect(getHfToken()).toBe('');
  });

  it('stores the OpenRouter token separately from the Hugging Face token', () => {
    setHfToken('hf_abc123');
    setOpenRouterToken('  sk-or-v1-abc123  ');

    expect(getHfToken()).toBe('hf_abc123');
    expect(getOpenRouterToken()).toBe('sk-or-v1-abc123');
  });

  it('clears the OpenRouter token when set to blank', () => {
    setOpenRouterToken('sk-or-v1-abc123');
    setOpenRouterToken('   ');

    expect(getOpenRouterToken()).toBe('');
  });
});
