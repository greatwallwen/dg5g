export interface SpeechNormalizerOptions {
  caption?: string;
  spokenText?: string;
  maxCaptionLength?: number;
  stripMarkup?: boolean;
}

export interface SpeechNormalizationDiagnostic {
  code: string;
  message: string;
  before: string;
  after: string;
  occurrences: number;
}

export interface SpeechNormalizationResult {
  spokenText: string;
  caption: string;
  diagnostics: SpeechNormalizationDiagnostic[];
}

interface SpeechNormalizationRule {
  code: string;
  message: string;
  pattern: RegExp;
  replacement: (match: string, ...captures: string[]) => string;
}

const SPEECH_RULES: SpeechNormalizationRule[] = [
  {
    code: '5qi-token',
    message: 'Read 5QI as a Chinese numeral followed by separated letters.',
    pattern: /\b5\s*QI\b/gi,
    replacement: () => '五 QI',
  },
  {
    code: 'rrc-connected-state',
    message: 'Expand RRC_CONNECTED into pronounceable protocol state text.',
    pattern: /\bRRC_CONNECTED(?:\s*状态)?\b/gi,
    replacement: () => 'RRC 已连接状态',
  },
  {
    code: 'ss-rsrp-token',
    message: 'Expand SS-RSRP into pronounceable metric text.',
    pattern: /\bSS\s*[-_]\s*RSRP\b/gi,
    replacement: () => '同步信号参考信号接收功率',
  },
  {
    code: 'db-range',
    message: 'Read dB ranges with a spoken range connector.',
    pattern: /(\d+(?:\.\d+)?)\s*[~～\-－–—]\s*(\d+(?:\.\d+)?)\s*dB\b/gi,
    replacement: (_match, start, end) => `${start} 到 ${end} 分贝`,
  },
  {
    code: 'dbm-unit',
    message: 'Read dBm as a Chinese engineering unit.',
    pattern: /dBm\b/gi,
    replacement: () => '分贝毫瓦',
  },
  {
    code: 'db-unit',
    message: 'Read dB as a Chinese engineering unit.',
    pattern: /dB\b/gi,
    replacement: () => '分贝',
  },
  {
    code: 'numeric-minus',
    message: 'Read numeric hyphens as ranges by default; arithmetic should use explicit spokenText.',
    pattern: /(\d+(?:\.\d+)?)\s*[-−－]\s*(?=\d)/g,
    replacement: (_match, value) => `${value} 到 `,
  },
  {
    code: 'percent-unit',
    message: 'Read percentages as Chinese spoken percent phrases.',
    pattern: /(\d+(?:\.\d+)?)\s*%/g,
    replacement: (_match, value) => `百分之 ${value}`,
  },
];

export function normalizeSpeechText(input: string, options: SpeechNormalizerOptions = {}): SpeechNormalizationResult {
  const stripMarkup = options.stripMarkup ?? true;
  const captionSource = options.caption ?? input;
  const spokenSource = options.spokenText ?? input;
  const diagnostics: SpeechNormalizationDiagnostic[] = [];
  const caption = limitCaption(
    normalizeWhitespace(stripMarkup ? stripInlineMarkup(captionSource) : captionSource),
    options.maxCaptionLength,
  );

  let spokenText = normalizeWhitespace(stripMarkup ? stripInlineMarkup(spokenSource) : spokenSource);
  for (const rule of SPEECH_RULES) spokenText = applyRule(spokenText, rule, diagnostics);
  spokenText = normalizeWhitespace(spokenText);

  return { spokenText, caption, diagnostics };
}

function applyRule(
  text: string,
  rule: SpeechNormalizationRule,
  diagnostics: SpeechNormalizationDiagnostic[],
): string {
  let occurrences = 0;
  let before = '';
  let after = '';
  const next = text.replace(rule.pattern, (...args: unknown[]) => {
    const match = String(args[0] ?? '');
    const captures = args.slice(1, -2).map((value) => String(value ?? ''));
    const replacement = rule.replacement(match, ...captures);
    if (replacement !== match) {
      occurrences++;
      before ||= match;
      after ||= replacement;
    }
    return replacement;
  });

  if (occurrences > 0) diagnostics.push({ code: rule.code, message: rule.message, before, after, occurrences });
  return next;
}

function normalizeWhitespace(value: string): string {
  return value
    .replace(/[\t\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\s+([，。；：！？、,.!?;:])/g, '$1')
    .trim();
}

function stripInlineMarkup(value: string): string {
  return value.replace(/<[^>]*>/g, ' ');
}

function limitCaption(value: string, maxLength?: number): string {
  if (!maxLength || maxLength <= 0 || value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(0, maxLength - 1))}...`;
}
