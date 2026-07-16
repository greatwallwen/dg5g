import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

export const root = process.cwd();
export const defaultBookId = process.env.DGBOOK_BOOK_ID || '5g';

export function loadTextbookManifest(bookId = defaultBookId) {
  const manifestPath = path.join(root, 'config', 'textbooks', bookId, 'textbook.manifest.json');
  return JSON.parse(readFileSync(manifestPath, 'utf-8'));
}

export const textbookManifest = loadTextbookManifest();

export function textbookOutputRelative(key, manifest = textbookManifest) {
  const value = manifest.outputs?.[key];
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Textbook manifest ${manifest.bookId ?? defaultBookId} is missing outputs.${key}`);
  }
  return value.replaceAll('\\', '/');
}

export function textbookOutput(key, manifest = textbookManifest) {
  return path.join(root, textbookOutputRelative(key, manifest));
}

export function listTextbookOutput(key, matcher = () => true) {
  const dir = textbookOutput(key);
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter(matcher);
}

export function readTextbookOutputJson(key) {
  return JSON.parse(readFileSync(textbookOutput(key), 'utf-8'));
}

export function readTextbookJsonFile(key, file) {
  return JSON.parse(readFileSync(path.join(textbookOutput(key), file), 'utf-8'));
}

export function textbookOutputLabel(key, file = '') {
  const base = textbookOutputRelative(key);
  return file ? `${base}/${file}` : base;
}
