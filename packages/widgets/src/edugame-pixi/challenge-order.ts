export function stableChallengeOrder<T extends { id: string }>(entries: T[], salt: string): T[] {
  return [...entries].sort((a, b) => challengeRank(a.id, salt) - challengeRank(b.id, salt));
}

export function avoidIndexAlignedTargets<T, U extends { id: string }>(
  items: T[],
  targets: U[],
  targetFor: (item: T) => string = (item) => ('target_id' in Object(item) ? String((item as { target_id?: string }).target_id ?? '') : ''),
): U[] {
  if (targets.length < 2) return targets;
  const limit = Math.min(3, targets.length);
  if (countAligned(items, targets, targetFor) < limit) return targets;
  for (let shift = 1; shift < targets.length; shift += 1) {
    const rotated = [...targets.slice(shift), ...targets.slice(0, shift)];
    if (countAligned(items, rotated, targetFor) < limit) return rotated;
  }
  return targets;
}

function countAligned<T, U extends { id: string }>(items: T[], targets: U[], targetFor: (item: T) => string): number {
  let aligned = 0;
  for (let index = 0; index < Math.min(items.length, targets.length); index += 1) {
    if (targetFor(items[index]!) === targets[index]?.id) aligned += 1;
  }
  return aligned;
}

function challengeRank(id: string, salt: string): number {
  const seed = [...`${salt}:${id}`].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return (seed * 37 + salt.length * 19) % 997;
}
