import type { AuthenticatedRole } from './actor.ts';

export const roleHomes: Record<AuthenticatedRole, string> = {
  student: '/student/home',
  teacher: '/teacher/workbench',
};

const sharedPrefixes = ['/course'] as const;
const rolePrefixes: Record<AuthenticatedRole, readonly string[]> = {
  student: ['/student', '/learn', '/classroom'],
  teacher: ['/teacher', '/present'],
};

export function homeForRole(role: AuthenticatedRole): string {
  return roleHomes[role];
}

export function safeNextForRole(value: unknown, role: AuthenticatedRole): string {
  const fallback = homeForRole(role);
  if (typeof value !== 'string' || value.length === 0 || value.length > 2_048) return fallback;
  if (value !== value.trim() || hasUnsafePathCharacters(value)) return fallback;

  let decoded = value;
  for (let index = 0; index < 3; index += 1) {
    try {
      const nextDecoded = decodeURIComponent(decoded);
      if (nextDecoded === decoded) break;
      decoded = nextDecoded;
    } catch {
      return fallback;
    }
  }
  if (hasUnsafePathCharacters(decoded)) return fallback;

  let parsed: URL;
  try {
    parsed = new URL(decoded, 'http://dgbook.local');
  } catch {
    return fallback;
  }
  if (parsed.origin !== 'http://dgbook.local') return fallback;
  const allowed = [...sharedPrefixes, ...rolePrefixes[role]];
  if (!allowed.some((prefix) => parsed.pathname === prefix || parsed.pathname.startsWith(`${prefix}/`))) {
    return fallback;
  }
  return value;
}

function hasUnsafePathCharacters(value: string): boolean {
  return !value.startsWith('/')
    || value.startsWith('//')
    || value.includes('\\')
    || /[\u0000-\u001f\u007f]/.test(value);
}
