import type { CSSProperties } from 'react';
import type { AnimationGenericElement } from '@dgbook/animation';

export type StageTableCell = {
  key: string;
  text: string;
  colSpan?: number;
  rowSpan?: number;
  style?: CSSProperties;
};

export type StageTableTheme = {
  color: string;
  dark: string;
  light: string;
  rowHeader: boolean;
  rowFooter: boolean;
  colHeader: boolean;
  colFooter: boolean;
  stripeRows: boolean;
};

export type NormalizedTable = {
  header?: StageTableCell[];
  rows: StageTableCell[][];
  columnWidths: string[];
  columnCount: number;
  rowHeights: Array<string | undefined>;
  border?: string;
  theme?: StageTableTheme;
};

export function shouldUseTableDeck(table: NormalizedTable, element: AnimationGenericElement) {
  const record = element as AnimationGenericElement & Record<string, unknown>;
  if (record.tableMode === 'deck') return true;
  if (record.tableMode === 'full') return false;
  return table.rows.length > 4 || table.columnCount > 3 || element.width < table.columnCount * 112;
}

export function readDeckPageSize(element: AnimationGenericElement) {
  const record = element as AnimationGenericElement & Record<string, unknown>;
  const value = Number(record.deckPageSize ?? record.pageSize ?? 3);
  return Number.isFinite(value) ? Math.max(2, Math.min(4, Math.floor(value))) : 3;
}

export function normalizeTable(element: AnimationGenericElement): NormalizedTable {
  const matrix = readTableMatrix(element);
  if (matrix.length > 0) return normalizeMatrixTable(element, matrix);

  const columns = element.columns?.length ? element.columns : [{ key: 'label', label: '指标' }, { key: 'value', label: '值' }];
  const rows: Array<Record<string, string | number>> = element.rows?.length
    ? element.rows
    : normalizeSeries(element).map((item) => ({ label: item.label, value: item.value }));
  return {
    header: columns.map((column) => ({ key: column.key, text: column.label })),
    rows: rows.map((row, rowIndex) => columns.map((column) => ({ key: `${rowIndex}-${column.key}`, text: String(row[column.key] ?? '') }))),
    columnWidths: columns.map((column) => column.width ? `${column.width}px` : `${100 / columns.length}%`),
    columnCount: columns.length,
    rowHeights: [],
    border: undefined,
    theme: readTableTheme(element),
  };
}

export function tableThemeCellStyle(
  theme: StageTableTheme,
  rowIndex: number,
  columnIndex: number,
  totalRows = 0,
  totalColumns = 0,
  ownBackground?: CSSProperties['backgroundColor'],
): CSSProperties {
  if (ownBackground) return {};
  if (theme.rowHeader && rowIndex === 0) return { backgroundColor: theme.color, color: '#fff', fontWeight: 900 };
  if (theme.rowFooter && totalRows > 0 && rowIndex === totalRows - 1) return { backgroundColor: theme.color, color: '#fff', fontWeight: 900 };
  if (theme.colHeader && columnIndex === 0) return { backgroundColor: theme.dark, color: '#fff', fontWeight: 850 };
  if (theme.colFooter && totalColumns > 0 && columnIndex === totalColumns - 1) return { backgroundColor: theme.dark, color: '#fff', fontWeight: 850 };
  if (theme.stripeRows && rowIndex % 2 === 1) return { backgroundColor: theme.light };
  return {};
}

function normalizeMatrixTable(element: AnimationGenericElement, matrix: unknown[][]): NormalizedTable {
  const record = element as AnimationGenericElement & Record<string, unknown>;
  const hiddenCells = hiddenTableCells(matrix);
  const rows = matrix.map((row, rowIndex) => row.map((cell, columnIndex) => {
    if (hiddenCells.has(`${rowIndex}:${columnIndex}`)) return null;
    return normalizeTableCell(cell, rowIndex, columnIndex);
  }).filter((cell): cell is StageTableCell => Boolean(cell)));
  const theme = readTableTheme(element);
  const hasHeader = theme?.rowHeader ?? true;
  const header = hasHeader ? rows[0] : undefined;
  const bodyRows = hasHeader ? rows.slice(1) : rows;
  return {
    header,
    rows: bodyRows,
    columnWidths: readTableColumnWidths(record.colWidths, element.width, matrix[0]?.length ?? 0),
    columnCount: matrix[0]?.length ?? 0,
    rowHeights: readTableRowHeights(record.rowHeights ?? record.cellMinHeight, bodyRows.length),
    border: readTableBorder(record.outline),
    theme,
  };
}

function normalizeTableCell(value: unknown, rowIndex: number, columnIndex: number): StageTableCell {
  if (!isRecord(value)) return { key: `${rowIndex}-${columnIndex}`, text: String(value ?? '') };
  const style = isRecord(value.style) ? value.style : {};
  const text = value.text ?? value.content ?? value.value ?? '';
  return {
    key: String(value.id ?? `${rowIndex}-${columnIndex}`),
    text: String(text),
    colSpan: readSpan(value.colspan ?? value.colSpan),
    rowSpan: readSpan(value.rowspan ?? value.rowSpan),
    style: {
      backgroundColor: readString(value.backcolor ?? value.background ?? style.backcolor ?? style.backgroundColor),
      color: readString(value.color ?? style.color),
      fontSize: readCssSize(value.fontSize ?? style.fontSize),
      fontFamily: readString(value.fontFamily ?? style.fontFamily),
      fontWeight: value.bold === true || style.bold === true ? 850 : readCssWeight(style.fontWeight),
      fontStyle: value.italic === true || style.italic === true ? 'italic' : readString(style.fontStyle),
      textAlign: readTextAlign(value.align ?? style.align ?? style.textAlign),
      verticalAlign: readString(value.verticalAlign ?? style.verticalAlign),
    },
  };
}

function hiddenTableCells(matrix: unknown[][]) {
  const hidden = new Set<string>();
  matrix.forEach((row, rowIndex) => {
    row.forEach((cell, columnIndex) => {
      if (!isRecord(cell)) return;
      const rowSpan = readSpan(cell.rowspan ?? cell.rowSpan) ?? 1;
      const colSpan = readSpan(cell.colspan ?? cell.colSpan) ?? 1;
      for (let r = rowIndex; r < rowIndex + rowSpan; r += 1) {
        for (let c = columnIndex; c < columnIndex + colSpan; c += 1) {
          if (r !== rowIndex || c !== columnIndex) hidden.add(`${r}:${c}`);
        }
      }
    });
  });
  return hidden;
}

function readTableTheme(element: AnimationGenericElement): StageTableTheme | undefined {
  const theme = (element as AnimationGenericElement & Record<string, unknown>).theme;
  if (!isRecord(theme)) return undefined;
  const color = readString(theme.color) ?? '#0f766e';
  return {
    color,
    dark: readString(theme.dark) ?? mixHexColor(color, '#0f172a', 0.28),
    light: readString(theme.light) ?? mixHexColor(color, '#ffffff', 0.88),
    rowHeader: theme.rowHeader !== false,
    rowFooter: theme.rowFooter === true,
    colHeader: theme.colHeader === true,
    colFooter: theme.colFooter === true,
    stripeRows: theme.stripeRows !== false,
  };
}

function readTableColumnWidths(value: unknown, tableWidth: number, count: number): string[] {
  if (!Array.isArray(value) || count <= 0) return count > 0 ? Array.from({ length: count }, () => `${100 / count}%`) : [];
  return value.slice(0, count).map((item) => {
    const width = Number(item);
    if (!Number.isFinite(width) || width <= 0) return `${100 / count}%`;
    return width <= 1 ? `${Math.max(1, width * tableWidth)}px` : `${width}px`;
  });
}

function readTableRowHeights(value: unknown, count: number): Array<string | undefined> {
  if (Array.isArray(value)) return value.slice(0, count).map((height) => readCssSize(height));
  const height = readCssSize(value);
  return height ? Array.from({ length: count }, () => height) : [];
}

function readTableBorder(value: unknown) {
  if (!isRecord(value)) return undefined;
  const width = Number(value.width ?? 1);
  const style = value.style === 'dashed' || value.style === 'dotted' ? value.style : 'solid';
  return `${Number.isFinite(width) ? width : 1}px ${style} ${readString(value.color) ?? '#cbd5e1'}`;
}

function readTableMatrix(element: AnimationGenericElement): unknown[][] {
  const data = element.data;
  if (!Array.isArray(data) || !Array.isArray(data[0])) return [];
  return data as unknown[][];
}

function readSpan(value: unknown) {
  const span = Number(value);
  return Number.isFinite(span) && span > 1 ? Math.floor(span) : undefined;
}

function readString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function readCssSize(value: unknown) {
  if (typeof value === 'string' && value.trim()) return value;
  const size = Number(value);
  return Number.isFinite(size) && size > 0 ? `${size}px` : undefined;
}

function readCssWeight(value: unknown): CSSProperties['fontWeight'] {
  if (typeof value === 'number' || typeof value === 'string') return value;
  return undefined;
}

function readTextAlign(value: unknown): CSSProperties['textAlign'] {
  if (value === 'left' || value === 'right' || value === 'center' || value === 'justify') return value;
  return undefined;
}

function normalizeSeries(element: AnimationGenericElement) {
  if (Array.isArray(element.series) && element.series.length > 0) return element.series;
  if (Array.isArray(element.data)) {
    return element.data.map((item, index) => {
      const record = item as Record<string, unknown>;
      return {
        label: String(record.label ?? record.name ?? `S${index + 1}`),
        value: Number(record.value ?? record.y ?? 0),
        color: typeof record.color === 'string' ? record.color : undefined,
      };
    });
  }
  return [
    { label: 'RSRP', value: 72, color: '#0f766e' },
    { label: 'SINR', value: 58, color: '#f59e0b' },
    { label: '速率', value: 86, color: '#2563eb' },
  ];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function mixHexColor(source: string, target: string, amount: number) {
  const a = parseHexColor(source);
  const b = parseHexColor(target);
  if (!a || !b) return source;
  const mix = (from: number, to: number) => Math.round(from + (to - from) * amount);
  return `rgb(${mix(a[0], b[0])}, ${mix(a[1], b[1])}, ${mix(a[2], b[2])})`;
}

function parseHexColor(value: string): [number, number, number] | null {
  const match = value.trim().match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!match) return null;
  const hex = match[1]!.length === 3
    ? match[1]!.split('').map((char) => `${char}${char}`).join('')
    : match[1]!;
  return [
    Number.parseInt(hex.slice(0, 2), 16),
    Number.parseInt(hex.slice(2, 4), 16),
    Number.parseInt(hex.slice(4, 6), 16),
  ];
}
