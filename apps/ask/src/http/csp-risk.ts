const SELF_TOKEN = "'self'";
const STRICT_DYNAMIC_TOKEN = "'strict-dynamic'";
const NONCE_PREFIX = "'nonce-";

const splitDirectives = (csp: string): Map<string, string[]> => {
  const directives = new Map<string, string[]>();
  for (const part of csp.split(';')) {
    const trimmed = part.trim();
    if (trimmed.length === 0) continue;
    const [name, ...sources] = trimmed.split(/\s+/u);
    if (name === undefined) continue;
    directives.set(name.toLowerCase(), sources);
  }
  return directives;
};

// Only fires when script-src/default-src is actually present and actually excludes us — an absent directive falls back to the browser default (allow), not a warning.
export const detectInjectionRisk = (
  cspHeader: string | undefined,
  proxyOrigin: string,
): string | null => {
  if (!cspHeader) return null;

  const directives = splitDirectives(cspHeader);
  const scriptSrc = directives.get('script-src');
  const sources = scriptSrc ?? directives.get('default-src');
  if (sources === undefined) return null;
  const directiveName = scriptSrc ? 'script-src' : 'default-src';

  if (sources.includes(STRICT_DYNAMIC_TOKEN)) return `${directiveName} uses 'strict-dynamic'`;
  if (sources.some((source) => source.startsWith(NONCE_PREFIX))) {
    return `${directiveName} requires a script nonce`;
  }
  if (sources.includes(SELF_TOKEN) || sources.includes(proxyOrigin)) return null;
  return `${directiveName} does not allow 'self' or the proxy origin`;
};
