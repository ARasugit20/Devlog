const SECRET_PATTERNS: RegExp[] = [
  /AIza[0-9A-Za-z\-_]{20,}/g,
  /sk-[0-9A-Za-z\-_]{20,}/g,
  /ghp_[0-9A-Za-z]{20,}/g,
  /xox[baprs]-[0-9A-Za-z-]{10,}/g,
  /(?<=\b(api[-_ ]?key|token|secret|password)\b\s*[:=]\s*["']?)[^"'\s]{6,}/gi,
];

export function redactSecrets(input: string, enabled: boolean): string {
  if (!enabled || !input) {
    return input;
  }

  return SECRET_PATTERNS.reduce(
    (value, pattern) => value.replace(pattern, '[REDACTED]'),
    input
  );
}
