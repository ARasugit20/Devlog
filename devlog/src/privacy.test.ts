import { describe, expect, it } from 'vitest';
import { redactSecrets } from './privacy';

describe('redactSecrets', () => {
  it('redacts API-like secrets when enabled', () => {
    const input = 'apiKey=sk-abcdefghijklmnopqrstuvwxyz12345 and token=ghp_abcdefghijk1234567890';
    const redacted = redactSecrets(input, true);
    expect(redacted).toContain('[REDACTED]');
    expect(redacted).not.toContain('sk-abcdefghijklmnopqrstuvwxyz12345');
    expect(redacted).not.toContain('ghp_abcdefghijk1234567890');
  });

  it('returns original string when disabled', () => {
    const input = 'keep-me';
    expect(redactSecrets(input, false)).toBe(input);
  });
});
