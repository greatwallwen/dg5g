import type { CSSProperties } from 'react';
import type { AnimationGenericElement } from '@dgbook/animation';
import {
  normalizeTable,
  readDeckPageSize,
  shouldUseTableDeck,
  tableThemeCellStyle,
  type NormalizedTable,
  type StageTableCell,
  type StageTableTheme,
} from './StageTableModel';
import type { TimelineElementState } from './timeline-runtime';

export function TableElement({ element, timelineState }: { element: AnimationGenericElement; timelineState?: TimelineElementState | null }) {
  const table = normalizeTable(element);
  const rowRevealCount = timelineState?.rowRevealCount;
  if (shouldUseTableDeck(table, element)) return <TableDeck element={element} table={table} rowRevealCount={rowRevealCount} />;
  return <StageTable table={table} rowRevealCount={rowRevealCount} mode="full" />;
}

function TableDeck({ element, table, rowRevealCount }: { element: AnimationGenericElement; table: NormalizedTable; rowRevealCount?: number }) {
  const pageSize = readDeckPageSize(element);
  const totalPages = Math.max(1, Math.ceil(table.rows.length / pageSize));
  const revealed = rowRevealCount ?? pageSize;
  const pageIndex = Math.min(totalPages - 1, Math.max(0, Math.floor(Math.max(0, revealed - 1) / pageSize)));
  const pageRows = table.rows.slice(pageIndex * pageSize, pageIndex * pageSize + pageSize);
  const pageReveal = rowRevealCount === undefined ? undefined : Math.max(0, revealed - pageIndex * pageSize);
  const pageTable = { ...table, rows: pageRows, rowHeights: table.rowHeights.slice(pageIndex * pageSize, pageIndex * pageSize + pageSize) };

  return (
    <div className="dg-stage-table-deck" data-table-mode="deck" data-table-pages={totalPages}>
      <StageTable table={pageTable} rowRevealCount={pageReveal} mode="deck" />
      {totalPages > 1 && (
        <div className="dg-stage-table-deck-nav" aria-hidden="true">
          {Array.from({ length: totalPages }, (_, index) => (
            <span key={index} className={index === pageIndex ? 'is-current' : undefined} />
          ))}
        </div>
      )}
    </div>
  );
}

function StageTable({ table, rowRevealCount, mode }: { table: NormalizedTable; rowRevealCount?: number; mode: 'full' | 'deck' }) {
  const themeClass = table.theme ? 'has-theme' : undefined;
  return (
    <table
      className={classNames('dg-stage-table', themeClass)}
      data-table-mode={mode}
      data-table-rows={table.rows.length}
      data-table-cols={table.columnCount}
      style={{
        '--dg-stage-table-accent': table.theme?.color,
        '--dg-stage-table-accent-dark': table.theme?.dark,
        '--dg-stage-table-accent-light': table.theme?.light,
        '--dg-stage-table-border': table.border,
      } as CSSProperties}
    >
      {table.columnWidths.length > 0 && (
        <colgroup>
          {table.columnWidths.map((width, index) => <col key={index} style={{ width }} />)}
        </colgroup>
      )}
      {table.header && (
        <thead>
          <tr>
            {table.header.map((cell, columnIndex) => (
              <TableCell key={cell.key} cell={cell} rowIndex={0} columnIndex={columnIndex} totalColumns={table.columnCount} as="th" theme={table.theme} />
            ))}
          </tr>
        </thead>
      )}
      <tbody>{table.rows.map((row, index) => {
        const rowVisible = rowRevealCount === undefined || index < rowRevealCount;
        return (
          <tr
            key={index}
            className={rowRevealCount === undefined ? undefined : rowVisible ? 'is-row-visible' : 'is-row-pending'}
            data-row-visible={rowRevealCount === undefined ? undefined : String(rowVisible)}
            style={{ height: table.rowHeights[index] }}
          >
            {row.map((cell, columnIndex) => (
              <TableCell
                key={cell.key}
                cell={cell}
                rowIndex={table.header ? index + 1 : index}
                columnIndex={columnIndex}
                totalRows={(table.header ? 1 : 0) + table.rows.length}
                totalColumns={table.columnCount}
                as="td"
                theme={table.theme}
              />
            ))}
          </tr>
        );
      })}</tbody>
    </table>
  );
}

function TableCell({
  cell,
  rowIndex,
  columnIndex,
  totalRows,
  totalColumns,
  as,
  theme,
}: {
  cell: StageTableCell;
  rowIndex: number;
  columnIndex: number;
  totalRows?: number;
  totalColumns?: number;
  as: 'td' | 'th';
  theme?: StageTableTheme;
}) {
  const Component = as;
  const themedStyle = theme ? tableThemeCellStyle(theme, rowIndex, columnIndex, totalRows, totalColumns, cell.style?.backgroundColor) : {};
  const style = { ...themedStyle, ...cell.style };
  const content = cell.text || ' ';
  const html = /<\/?[a-z][\s\S]*>/i.test(content);
  return (
    <Component colSpan={cell.colSpan} rowSpan={cell.rowSpan} style={style} dangerouslySetInnerHTML={html ? { __html: content } : undefined}>
      {html ? undefined : content}
    </Component>
  );
}


function classNames(...values: Array<string | false | undefined | null>) {
  return values.filter(Boolean).join(' ');
}
