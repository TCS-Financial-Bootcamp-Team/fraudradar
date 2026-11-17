export interface ParsedLegalSource {
  title: string;
  excerpt: string;
  officialUrl: string | null;
}

const LINE_URL_RE = /^[ \t]*Fonte oficial:[ \t]*(\S+)[ \t]*$/gim;
const INLINE_URL_RE = /(?:[ \t]*·[ \t]*|[ \t]+)Fonte oficial:[ \t]*(\S+)[ \t]*$/i;

function toSafeHttpsUrl(raw: string): string | null {
  const cleaned = raw.trim().replace(/[).,;]+$/, "");
  if (!/^https:\/\//i.test(cleaned)) return null;
  try {
    const parsed = new URL(cleaned);
    return parsed.protocol === "https:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}

/**
 * Extrai a URL oficial (somente HTTPS) de trechos de fonte jurídica e remove
 * a linha `Fonte oficial: ...` do resumo exibido.
 */
export function parseLegalSource(source: {
  title: string;
  excerpt: string;
}): ParsedLegalSource {
  let officialUrl: string | null = null;
  let excerpt = source.excerpt.replace(/\r\n?/g, "\n");

  excerpt = excerpt.replace(LINE_URL_RE, (_match, urlCandidate: string) => {
    if (!officialUrl) {
      officialUrl = toSafeHttpsUrl(urlCandidate);
    }
    return "";
  });

  const inlineMatch = INLINE_URL_RE.exec(excerpt);
  if (inlineMatch) {
    if (!officialUrl) {
      officialUrl = toSafeHttpsUrl(inlineMatch[1]);
    }
    excerpt = excerpt.slice(0, inlineMatch.index);
  }

  const cleanExcerpt = excerpt
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return {
    title: source.title,
    excerpt: cleanExcerpt,
    officialUrl,
  };
}
