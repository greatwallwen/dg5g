const nextRouteRuntimeExports = new Set([
  'GET',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'HEAD',
  'OPTIONS',
  'config',
  'dynamic',
  'dynamicParams',
  'revalidate',
  'fetchCache',
  'runtime',
  'preferredRegion',
  'maxDuration',
  'generateStaticParams',
]);

export function findUnsupportedNextRouteRuntimeExports(source) {
  const runtimeExports = new Set();

  if (/^\s*export\s+default\b/m.test(source)) runtimeExports.add('default');
  if (/^\s*export\s+\*/m.test(source)) runtimeExports.add('*');

  const declarationPattern = /^\s*export\s+(?:declare\s+)?(?:async\s+)?(?:function|class|enum|namespace)\s+([A-Za-z_$][\w$]*)/gm;
  for (const match of source.matchAll(declarationPattern)) runtimeExports.add(match[1]);

  const variablePattern = /^\s*export\s+(?:declare\s+)?(?:const|let|var)\s+([\s\S]*?);/gm;
  for (const match of source.matchAll(variablePattern)) {
    for (const declaration of splitTopLevel(match[1], ',')) {
      const name = /^\s*([A-Za-z_$][\w$]*)\b/.exec(declaration)?.[1];
      if (name) runtimeExports.add(name);
      else if (declaration.trim()) runtimeExports.add('<destructured>');
    }
  }

  const exportListPattern = /^\s*export\s*\{([\s\S]*?)\}\s*(?:from\s+[^;]+)?;?/gm;
  for (const match of source.matchAll(exportListPattern)) {
    for (const specifier of splitTopLevel(match[1], ',')) {
      const trimmed = specifier.trim();
      if (!trimmed || /^type\b/.test(trimmed)) continue;
      const parts = trimmed.split(/\s+as\s+/);
      runtimeExports.add((parts[1] ?? parts[0]).trim());
    }
  }

  return [...runtimeExports]
    .filter((name) => !nextRouteRuntimeExports.has(name))
    .sort();
}

function splitTopLevel(source, separator) {
  const parts = [];
  let start = 0;
  let depth = 0;
  let quote = null;
  let escaped = false;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === quote) quote = null;
      continue;
    }
    if (character === '"' || character === "'" || character === '`') {
      quote = character;
      continue;
    }
    if (character === '(' || character === '[' || character === '{') depth += 1;
    else if (character === ')' || character === ']' || character === '}') depth = Math.max(0, depth - 1);
    else if (character === separator && depth === 0) {
      parts.push(source.slice(start, index));
      start = index + 1;
    }
  }
  parts.push(source.slice(start));
  return parts;
}
