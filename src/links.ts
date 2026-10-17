const SAFE = new Set(["http:", "https:", "mailto:"]);

/** A URL that is safe to open from a topic link, or null. A bare host gets https://; javascript:, file: and the like are refused. */
export function normalizeUrl(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(s) && !/^[^/]*:\d+(\/|$)/.test(s); // "host:8080" is a host, not a scheme
  try {
    const url = new URL(hasScheme ? s : `https://${s}`);
    return SAFE.has(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}
