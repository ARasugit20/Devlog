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

  it('redacts Google Gemini-style keys', () => {
    const input = 'key=AIzaSyabcdefghijklmnopqrstuvwxyz123456';
    expect(redactSecrets(input, true)).not.toContain('AIzaSyabcdefghijklmnopqrstuvwxyz123456');
  });

  it('redacts Slack-style bot tokens', () => {
    const token = ['xoxb', '1234567890', 'redactedplaceholder'].join('-');
    const input = `SLACK=${token}`;
    expect(redactSecrets(input, true)).not.toContain(token);
  });

  it('redacts labeled passwords', () => {
    const input = 'password: supersecretvalue';
    expect(redactSecrets(input, true)).toBe('password: [REDACTED]');
  });

  it('handles empty strings safely', () => {
    expect(redactSecrets('', true)).toBe('');
  });
});
