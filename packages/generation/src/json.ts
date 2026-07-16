export function stripCodeFences(text: string): string {
  return text.trim().replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?\s*```\s*$/i, '').trim();
}

export function parseJsonResponse<T>(raw: string): T | null {
  const text = stripCodeFences(raw);
  const candidates = candidateJsonStrings(text);
  for (const candidate of candidates) {
    const parsed = tryParse<T>(candidate);
    if (parsed !== null) return parsed;
  }
  return null;
}

export function parseJsonArrayResponse<T>(raw: string): T[] {
  const parsed = parseJsonResponse<T[]>(raw);
  return Array.isArray(parsed) ? parsed : [];
}

function candidateJsonStrings(text: string): string[] {
  const candidates = [text];
  const objectStart = text.indexOf('{');
  const objectEnd = text.lastIndexOf('}');
  if (objectStart >= 0 && objectEnd > objectStart) candidates.push(text.slice(objectStart, objectEnd + 1));
  const arrayStart = text.indexOf('[');
  const arrayEnd = text.lastIndexOf(']');
  if (arrayStart >= 0 && arrayEnd > arrayStart) candidates.push(text.slice(arrayStart, arrayEnd + 1));
  return [...new Set(candidates.map(repairCommonJsonIssues))];
}

function tryParse<T>(value: string): T | null {
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function repairCommonJsonIssues(value: string): string {
  return value
    .replace(/^\uFEFF/, '')
    .replace(/,\s*([}\]])/g, '$1')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'");
}

export function stableId(prefix: string, index?: number): string {
  if (typeof index === 'number') return `${prefix}-${String(index + 1).padStart(3, '0')}`;
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

export function cleanText(value: string, maxLength = 120): string {
  const text = value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 1)).trim()}…`;
}

export function extractPlainText(markdownOrMdx: string, maxLength = 5000): string {
  return cleanText(
    markdownOrMdx
      .replace(/^---[\s\S]*?\n---/m, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\{[\s\S]*?\}/g, ' '),
    maxLength,
  );
}
