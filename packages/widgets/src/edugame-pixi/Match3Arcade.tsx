import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { GameItem } from '@dgbook/edugame-core';
import { BoardCanvas } from './BoardCanvas';
import { GameIcon } from './icons';

type MatchTile = {
  id: string;
  item: GameItem;
  groupKey: string;
  groupLabel: string;
  color: number;
};

type MatchGroupEntry = [string, { label: string; items: GameItem[]; color: number }];

type MatchBurst = {
  key: string;
  index: number;
  label: string;
  tone: 'clear' | 'miss' | 'cascade';
};

const BOARD_SIZE = 6;
const START_MOVES = 18;

export interface Match3ArcadeProps {
  items: GameItem[];
  doneIds: string[];
  combo: number;
  goal?: string;
  result: 'idle' | 'correct' | 'wrong' | 'complete';
  targetCount: number;
  active: boolean;
  onMatch: (item: GameItem, tileIds: string[]) => void;
  onMiss: (item: GameItem) => void;
  onDefeat?: () => void;
}

export function Match3Arcade({
  items,
  doneIds,
  combo,
  goal,
  result,
  targetCount,
  active,
  onMatch,
  onMiss,
  onDefeat,
}: Match3ArcadeProps) {
  const initialBoard = useMemo(() => buildMatch3Board(items), [items]);
  const [board, setBoard] = useState<MatchTile[]>(initialBoard);
  const [picked, setPicked] = useState<string | null>(null);
  const [swapIds, setSwapIds] = useState<string[]>([]);
  const [clearingIds, setClearingIds] = useState<string[]>([]);
  const [fallingIds, setFallingIds] = useState<string[]>([]);
  const [wrongIds, setWrongIds] = useState<string[]>([]);
  const [bursts, setBursts] = useState<MatchBurst[]>([]);
  const [movesLeft, setMovesLeft] = useState(START_MOVES);
  const [missionHits, setMissionHits] = useState(0);
  const [cascadeLevel, setCascadeLevel] = useState(0);
  const timerRef = useRef<number | null>(null);
  const serialRef = useRef(1000);
  const cleared = doneIds.length;
  const mission = useMemo(() => buildMatch3Mission(initialBoard), [initialBoard]);
  const missionPct = Math.round((missionHits / Math.max(1, mission.target)) * 100);
  const pressureState = movesLeft <= 4 ? 'danger' : combo >= 3 ? 'combo' : active ? 'active' : 'ready';
  const swapIndexes = swapIds
    .map((id) => board.findIndex((entry) => entry.id === id))
    .filter((index) => index >= 0);

  useEffect(() => {
    setBoard(initialBoard);
    setPicked(null);
    setSwapIds([]);
    setClearingIds([]);
    setFallingIds([]);
    setWrongIds([]);
    setBursts([]);
    setMovesLeft(START_MOVES);
    setMissionHits(0);
    setCascadeLevel(0);
  }, [initialBoard]);

  useEffect(() => () => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
  }, []);

  useEffect(() => {
    if (!active || result === 'complete' || movesLeft > 0 || missionHits >= mission.target) return;
    onDefeat?.();
  }, [active, movesLeft, missionHits, mission.target, onDefeat, result]);

  const tap = (tile: MatchTile) => {
    if (!active || movesLeft <= 0 || doneIds.includes(tile.id) || wrongIds.length || clearingIds.length) return;
    if (!picked) {
      setPicked(tile.id);
      return;
    }
    if (picked === tile.id) {
      setPicked(null);
      return;
    }

    const firstIndex = board.findIndex((entry) => entry.id === picked);
    const secondIndex = board.findIndex((entry) => entry.id === tile.id);
    if (!areAdjacent(firstIndex, secondIndex)) {
      setPicked(tile.id);
      return;
    }

    const swapped = swapTiles(board, firstIndex, secondIndex);
    const matches = findMatches(swapped);
    setBoard(swapped);
    setPicked(null);
    setSwapIds([picked, tile.id]);
    setMovesLeft((current) => Math.max(0, current - 1));

    if (matches.length >= 3) {
      const matchedTiles = swapped.filter((entry) => matches.includes(entry.id));
      const missionGain = matchedTiles.filter((entry) => entry.groupKey === mission.key).length;
      const burstSeed = Date.now();
      if (missionGain <= 0) {
        setWrongIds(matches);
        setBursts(matches.slice(0, 4).map((id) => ({
          key: `${burstSeed}-miss-${id}`,
          index: swapped.findIndex((entry) => entry.id === id),
          label: '偏航',
          tone: 'miss',
        })));
        onMiss(tile.item);
        if (timerRef.current) window.clearTimeout(timerRef.current);
        timerRef.current = window.setTimeout(() => {
          setBoard(board);
          setSwapIds([]);
          setWrongIds([]);
          setBursts([]);
          timerRef.current = null;
        }, 520);
        return;
      }
      const missionIds = matchedTiles.filter((entry) => entry.groupKey === mission.key).map((entry) => entry.id);
      setBursts(matches.map((id, index) => ({
        key: `${burstSeed}-${id}`,
        index: swapped.findIndex((entry) => entry.id === id),
        label: index === 0 ? `+${missionGain}` : '连消',
        tone: index > 2 ? 'cascade' : 'clear',
      })));
      if (timerRef.current) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => {
        setSwapIds([]);
        setClearingIds(matches);
        setCascadeLevel((current) => current + 1);
        if (missionGain > 0) setMissionHits((current) => Math.min(mission.target, current + missionGain));
        setMovesLeft((current) => Math.min(START_MOVES + 6, current + Math.max(1, Math.floor(matches.length / 3))));
        onMatch(swapped.find((entry) => missionIds.includes(entry.id))!.item, missionIds);
        timerRef.current = window.setTimeout(() => {
          const nextBoard = refillBoard(swapped, matches, items, serialRef, mission.key);
          setBoard(nextBoard.board);
          setClearingIds([]);
          setFallingIds(nextBoard.createdIds);
          timerRef.current = window.setTimeout(() => {
            setFallingIds([]);
            setBursts([]);
            timerRef.current = null;
          }, 360);
        }, 360);
      }, 180);
      return;
    }

    setWrongIds([picked, tile.id]);
    onMiss(tile.item);
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      setBoard(board);
      setSwapIds([]);
      setWrongIds([]);
      timerRef.current = null;
    }, 420);
  };

  return (
    <div
      className="eg-match3"
      data-edugame-match3-mission={mission.key}
      data-edugame-match3-mission-progress={`${missionHits}/${mission.target}`}
      data-edugame-match3-moves={movesLeft}
      data-edugame-match3-pressure={pressureState}
      data-edugame-match3-cascade={cascadeLevel}
      data-edugame-match3-motion="gravity-swap"
      data-edugame-match3-challenge="mission-moves-decoys"
    >
      <div className="eg-arcade-bar">
        <strong>分类连消</strong>
        <span>{goal || '交换相邻知识卡，优先消除本关目标类别。'}</span>
        <em>只有目标类别三连才计入进度；干扰类别会回弹并消耗机会。</em>
        <span className="eg-gr-clear">已命中 {Math.min(cleared, targetCount)}/{targetCount}</span>
        <span className="eg-match3-moves" data-edugame-match3-move-budget>步数 {movesLeft}</span>
        {combo > 1 && <span className="eg-arcade-combo">连击 x{combo}</span>}
      </div>
      <div className={`eg-stage-wrap eg-match3-stage${result === 'wrong' ? ' is-shake' : ''}`} data-edugame-result={result}>
        <BoardCanvas />
        <div className="eg-match3-field" role="grid" aria-label="三消分类棋盘">
          <div className="eg-match3-goal">
            <strong>本关目标</strong>
            <span>优先消除 <b>{mission.label}</b>，连击可追回步数。</span>
            <em className="eg-match3-objective" data-edugame-match3-objective>{missionHits}/{mission.target}</em>
            <span className="eg-match3-meter" data-edugame-match3-challenge-meter><i style={{ width: `${missionPct}%` }} /></span>
            <em className="eg-match3-move-pill">剩 {movesLeft} 步</em>
            {cascadeLevel > 0 && <em className="eg-match3-streak" data-edugame-match3-cascade-badge>连锁 {cascadeLevel}</em>}
          </div>
          <div className="eg-match3-board" data-edugame-match3-board-state={clearingIds.length ? 'clearing' : fallingIds.length ? 'falling' : swapIds.length ? 'swapping' : 'live'}>
            {swapIndexes.length === 2 && (
              <span
                className="eg-match3-swap-beam"
                data-edugame-match3-swap-beam
                style={beamStyle(swapIndexes[0]!, swapIndexes[1]!)}
              />
            )}
            {(clearingIds.length > 0 || fallingIds.length > 0) && (
              <span className="eg-match3-motion-pulse" data-edugame-match3-motion-pulse />
            )}
            {board.map((tile, index) => {
              const selected = picked === tile.id;
              const wrong = wrongIds.includes(tile.id);
              const clearedTile = clearingIds.includes(tile.id);
              const swapping = swapIds.includes(tile.id);
              const falling = fallingIds.includes(tile.id);
              const visualLabel = tileLabel(tile.item.label);
              return (
                <button
                  key={tile.id}
                  type="button"
                  role="gridcell"
                  title={`${tile.item.label} / ${tile.groupLabel}`}
                  aria-label={`${tile.item.label}，类别：${tile.groupLabel}`}
                  className={`eg-match3-tile${selected ? ' is-picked' : ''}${wrong ? ' is-wrong' : ''}${clearedTile ? ' is-clear' : ''}${swapping ? ' is-swap' : ''}${falling ? ' is-fall' : ''}`}
                  data-edugame-item={tile.id}
                  data-edugame-correct="neutral"
                  data-edugame-match3-objective-tile={tile.groupKey === mission.key ? 'true' : 'false'}
                  data-edugame-match3-mission-tile={tile.groupKey === mission.key ? 'true' : 'false'}
                  data-edugame-match3-label={visualLabel}
                  data-group={tile.groupKey}
                  data-index={index}
                  data-row={Math.floor(index / BOARD_SIZE)}
                  data-col={index % BOARD_SIZE}
                  disabled={!active || clearedTile}
                  style={{
                    '--m3-color': String(tile.color),
                    '--m3-delay': `${(index % 9) * 90}ms`,
                  } as CSSProperties}
                  onClick={() => tap(tile)}
                >
                  <GameIcon label={tile.item.label} className="eg-match3-ic" />
                  <span className="eg-match3-label">{visualLabel}</span>
                </button>
              );
            })}
            {bursts.map((burst) => (
              <span
                key={burst.key}
                className={`eg-match3-burst is-${burst.tone}`}
                data-edugame-match3-burst
                data-edugame-match3-burst-tone={burst.tone}
                style={burstStyle(burst.index)}
              >
                {burst.label}
              </span>
            ))}
          </div>
          <div className="eg-match3-side">
            {match3Legend(board).map((entry) => (
              <span key={entry.key}>
                <i style={{ '--m3-color': String(entry.color) } as CSSProperties} />
                {entry.label}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function buildMatch3Board(items: GameItem[]): MatchTile[] {
  const entries = buildMatchGroups(items);
  if (!entries.length) return [];

  const random = seededRandom(items.map((item) => item.id).join('|') || 'match-3');
  let board = buildNoImmediateMatchBoard(entries, random);
  if (!hasAvailableSwap(board)) board = forceAvailableSwap(board, entries);
  const mission = buildMatch3Mission(board);
  if (!hasAvailableSwapForGroup(board, mission.key)) {
    board = forceAvailableSwapForGroup(board, entries, mission.key, items.map((item) => item.id).join('|'));
  }
  return board;
}

function buildNoImmediateMatchBoard(
  entries: MatchGroupEntry[],
  random: () => number,
): MatchTile[] {
  const board: MatchTile[] = [];
  for (let index = 0; index < BOARD_SIZE * BOARD_SIZE; index += 1) {
    const candidates = shuffledEntries(entries, random);
    const safe = candidates.find((entry) => !wouldCreateImmediateMatch(board, index, entry[0])) ?? candidates[0]!;
    board.push(createTileFromEntry(index, safe, board.length + 1));
  }
  return board;
}

function shuffledEntries(
  entries: MatchGroupEntry[],
  random: () => number,
): MatchGroupEntry[] {
  return [...entries].sort(() => random() - 0.5);
}

function wouldCreateImmediateMatch(board: MatchTile[], index: number, groupKey: string): boolean {
  const row = Math.floor(index / BOARD_SIZE);
  const col = index % BOARD_SIZE;
  const leftA = col >= 1 ? board[index - 1]?.groupKey : '';
  const leftB = col >= 2 ? board[index - 2]?.groupKey : '';
  const upA = row >= 1 ? board[index - BOARD_SIZE]?.groupKey : '';
  const upB = row >= 2 ? board[index - BOARD_SIZE * 2]?.groupKey : '';
  return (leftA === groupKey && leftB === groupKey) || (upA === groupKey && upB === groupKey);
}

function forceAvailableSwap(
  board: MatchTile[],
  entries: MatchGroupEntry[],
): MatchTile[] {
  if (entries.length < 2) return board;
  const next = [...board];
  next[0] = createTileFromEntry(0, entries[0]!, 9001);
  next[1] = createTileFromEntry(1, entries[0]!, 9002);
  next[2] = createTileFromEntry(2, entries[1]!, 9003);
  next[8] = createTileFromEntry(8, entries[0]!, 9004);
  return findMatches(next).length ? buildNoImmediateMatchBoard(entries, seededRandom('fallback-match-3')) : next;
}

function forceAvailableSwapForGroup(
  board: MatchTile[],
  entries: MatchGroupEntry[],
  groupKey: string,
  seed = groupKey,
): MatchTile[] {
  const mission = entries.find((entry) => entry[0] === groupKey);
  const other = entries.find((entry) => entry[0] !== groupKey);
  if (!mission || !other) return board;
  const random = seededRandom(`${seed}:${groupKey}:mission-swap`);
  const slots = Array.from({ length: (BOARD_SIZE - 1) * (BOARD_SIZE - 2) }, (_, index) => ({
    row: Math.floor(index / (BOARD_SIZE - 2)),
    col: index % (BOARD_SIZE - 2),
    rank: random(),
  })).sort((a, b) => a.rank - b.rank);
  for (const slot of slots) {
    const base = slot.row * BOARD_SIZE + slot.col;
    const next = [...board];
    const placements: Array<[number, MatchGroupEntry]> = [
      [base, mission],
      [base + 1, mission],
      [base + 2, other],
      [base + BOARD_SIZE, other],
      [base + BOARD_SIZE + 1, other],
      [base + BOARD_SIZE + 2, mission],
    ];
    for (const [index, entry] of placements) {
      next[index] = createTileFromEntry(index, entry, 9100 + index);
    }
    if (!findMatches(next).length && hasAvailableSwapForGroup(next, groupKey)) return next;
  }
  return board;
}

function buildMatch3Mission(board: MatchTile[]): { key: string; label: string; target: number } {
  const counts = new Map<string, { label: string; count: number }>();
  for (const tile of board) {
    const entry = counts.get(tile.groupKey) ?? { label: tile.groupLabel, count: 0 };
    entry.count += 1;
    counts.set(tile.groupKey, entry);
  }
  const ranked = [...counts.entries()].sort((a, b) => b[1].count - a[1].count);
  const [key, entry] = ranked.find(([candidate]) => hasAvailableSwapForGroup(board, candidate))
    ?? ranked[0]
    ?? ['', { label: '核心类别', count: 0 }];
  return { key, label: entry.label, target: Math.min(12, Math.max(6, Math.floor(entry.count * 0.75))) };
}

function buildMatchGroups(items: GameItem[]): MatchGroupEntry[] {
  const source = items.filter((item) => item.correct !== false);
  const pool = source.length ? source : items;
  const groups = new Map<string, { label: string; items: GameItem[]; color: number }>();

  for (const item of pool) {
    const key = item.target_id || item.kp || item.definition || item.id;
    const label = compact(item.definition || item.target_id || item.kp || item.label, 8);
    const entry = groups.get(key) ?? { label, items: [], color: groups.size % 6 };
    entry.items.push(item);
    groups.set(key, entry);
  }

  const entries = [...groups.entries()].slice(0, 6);
  while (entries.length < 3 && pool.length) {
    const item = pool[entries.length % pool.length]!;
    entries.push([
      `fallback-${entries.length}-${item.id}`,
      { label: compact(item.label, 8), items: [item], color: entries.length % 6 },
    ]);
  }
  return entries;
}

function createTile(
  index: number,
  entries: MatchGroupEntry[],
  serial: number,
): MatchTile {
  const groupIndex = Math.abs((serial * 7 + index * 11) % entries.length);
  return createTileFromEntry(index, entries[groupIndex]!, serial);
}

function createTileFromEntry(
  index: number,
  entry: MatchGroupEntry,
  serial: number,
): MatchTile {
  const [groupKey, group] = entry;
  const item = group.items[(index + serial) % group.items.length]!;
  return {
    id: `m3-${serial}-${index}-${item.id}`,
    item,
    groupKey,
    groupLabel: group.label,
    color: group.color,
  };
}

function seededRandom(seed: string): () => number {
  let state = 2166136261;
  for (const char of seed) {
    state ^= char.charCodeAt(0);
    state = Math.imul(state, 16777619);
  }
  return () => {
    state += 0x6D2B79F5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function areAdjacent(firstIndex: number, secondIndex: number): boolean {
  if (firstIndex < 0 || secondIndex < 0) return false;
  const firstRow = Math.floor(firstIndex / BOARD_SIZE);
  const firstCol = firstIndex % BOARD_SIZE;
  const secondRow = Math.floor(secondIndex / BOARD_SIZE);
  const secondCol = secondIndex % BOARD_SIZE;
  return Math.abs(firstRow - secondRow) + Math.abs(firstCol - secondCol) === 1;
}

function swapTiles(board: MatchTile[], firstIndex: number, secondIndex: number): MatchTile[] {
  const next = [...board];
  [next[firstIndex], next[secondIndex]] = [next[secondIndex]!, next[firstIndex]!];
  return next;
}

function findMatches(board: MatchTile[]): string[] {
  const matches = new Set<string>();
  for (let row = 0; row < BOARD_SIZE; row += 1) {
    collectRun(board, matches, row * BOARD_SIZE, 1);
  }
  for (let col = 0; col < BOARD_SIZE; col += 1) {
    collectRun(board, matches, col, BOARD_SIZE);
  }
  return [...matches];
}

function collectRun(board: MatchTile[], matches: Set<string>, start: number, step: number): void {
  let run: MatchTile[] = [];
  for (let offset = 0; offset < BOARD_SIZE; offset += 1) {
    const tile = board[start + offset * step]!;
    if (!run.length || run[0]!.groupKey === tile.groupKey) {
      run.push(tile);
    } else {
      if (run.length >= 3) run.forEach((entry) => matches.add(entry.id));
      run = [tile];
    }
  }
  if (run.length >= 3) run.forEach((entry) => matches.add(entry.id));
}

function refillBoard(
  board: MatchTile[],
  clearedIds: string[],
  items: GameItem[],
  serialRef: { current: number },
  missionKey: string,
): { board: MatchTile[]; createdIds: string[] } {
  const cleared = new Set(clearedIds);
  const entries = buildMatchGroups(items);
  const next: MatchTile[] = Array.from({ length: BOARD_SIZE * BOARD_SIZE });
  const animatedIds: string[] = [];
  for (let col = 0; col < BOARD_SIZE; col += 1) {
    let writeRow = BOARD_SIZE - 1;
    for (let row = BOARD_SIZE - 1; row >= 0; row -= 1) {
      const sourceIndex = row * BOARD_SIZE + col;
      const tile = board[sourceIndex]!;
      if (cleared.has(tile.id)) continue;
      const targetIndex = writeRow * BOARD_SIZE + col;
      next[targetIndex] = tile;
      if (targetIndex !== sourceIndex) animatedIds.push(tile.id);
      writeRow -= 1;
    }
    while (writeRow >= 0) {
      const targetIndex = writeRow * BOARD_SIZE + col;
      const tile = createTile(targetIndex, entries, serialRef.current);
      serialRef.current += 1;
      next[targetIndex] = tile;
      animatedIds.push(tile.id);
      writeRow -= 1;
    }
  }
  let candidate = next;
  if (findMatches(candidate).length) {
    candidate = buildNoImmediateMatchBoard(entries, seededRandom(`refill-${serialRef.current}-${missionKey}`));
    animatedIds.push(...candidate.map((tile) => tile.id));
  }
  if (!hasAvailableSwapForGroup(candidate, missionKey)) {
    const targetReady = forceAvailableSwapForGroup(candidate, entries, missionKey);
    if (hasAvailableSwapForGroup(targetReady, missionKey)) {
      return { board: targetReady, createdIds: [...new Set([...animatedIds, ...targetReady.slice(0, 15).map((tile) => tile.id)])] };
    }
  }
  if (!hasAvailableSwap(candidate)) {
    const rebuilt = rebuildSolvableBoard(items, serialRef);
    return { board: rebuilt, createdIds: rebuilt.map((tile) => tile.id) };
  }
  return { board: candidate, createdIds: animatedIds };
}

function hasAvailableSwap(board: MatchTile[]): boolean {
  for (let index = 0; index < board.length; index += 1) {
    for (const delta of [1, BOARD_SIZE]) {
      const target = index + delta;
      if (target >= board.length) continue;
      if (delta === 1 && Math.floor(index / BOARD_SIZE) !== Math.floor(target / BOARD_SIZE)) continue;
      if (findMatches(swapTiles(board, index, target)).length >= 3) return true;
    }
  }
  return false;
}

function hasAvailableSwapForGroup(board: MatchTile[], groupKey: string): boolean {
  if (!groupKey) return false;
  for (let index = 0; index < board.length; index += 1) {
    for (const delta of [1, BOARD_SIZE]) {
      const target = index + delta;
      if (target >= board.length) continue;
      if (delta === 1 && Math.floor(index / BOARD_SIZE) !== Math.floor(target / BOARD_SIZE)) continue;
      const swapped = swapTiles(board, index, target);
      const matched = findMatches(swapped);
      if (matched.some((id) => swapped.find((tile) => tile.id === id)?.groupKey === groupKey)) return true;
    }
  }
  return false;
}

function rebuildSolvableBoard(items: GameItem[], serialRef: { current: number }): MatchTile[] {
  const entries = buildMatchGroups(items);
  if (!entries.length) return [];
  const board: MatchTile[] = [];
  for (let index = 0; index < BOARD_SIZE * BOARD_SIZE; index += 1) {
    board.push(createTile(index, entries, serialRef.current));
    serialRef.current += 1;
  }
  return board;
}

function match3Legend(board: MatchTile[]): Array<{ key: string; label: string; color: number }> {
  const seen = new Set<string>();
  const rows: Array<{ key: string; label: string; color: number }> = [];
  for (const tile of board) {
    if (seen.has(tile.groupKey)) continue;
    seen.add(tile.groupKey);
    rows.push({ key: tile.groupKey, label: tile.groupLabel, color: tile.color });
  }
  return rows.slice(0, 6);
}

function burstStyle(index: number): CSSProperties {
  const safeIndex = Math.max(0, index);
  const row = Math.floor(safeIndex / BOARD_SIZE);
  const col = safeIndex % BOARD_SIZE;
  return {
    left: `${((col + 0.5) / BOARD_SIZE) * 100}%`,
    top: `${((row + 0.5) / BOARD_SIZE) * 100}%`,
  };
}

function beamStyle(firstIndex: number, secondIndex: number): CSSProperties {
  const first = cellCenter(firstIndex);
  const second = cellCenter(secondIndex);
  const dx = second.x - first.x;
  const dy = second.y - first.y;
  const width = Math.sqrt(dx * dx + dy * dy);
  const angle = Math.atan2(dy, dx) * (180 / Math.PI);
  return {
    left: `${first.x}%`,
    top: `${first.y}%`,
    width: `${width}%`,
    transform: `rotate(${angle}deg)`,
  };
}

function cellCenter(index: number): { x: number; y: number } {
  const safeIndex = Math.max(0, index);
  const row = Math.floor(safeIndex / BOARD_SIZE);
  const col = safeIndex % BOARD_SIZE;
  return {
    x: ((col + 0.5) / BOARD_SIZE) * 100,
    y: ((row + 0.5) / BOARD_SIZE) * 100,
  };
}

function tileLabel(value: string): string {
  const compacted = value
    .replace(/[A-Za-z]*\d+[A-Za-z-]*/g, (token) => token.toUpperCase())
    .replace(/[，。；、：:()（）]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)[0] || value;
  return compacted.length > 4 ? compacted.slice(0, 4) : compacted;
}

function compact(value: string, max: number): string {
  const text = value.trim();
  return text.length > max ? `${text.slice(0, max - 1)}...` : text;
}
