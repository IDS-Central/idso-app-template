// DATA TABLE: Reusable table component with sorting, search, and row selection.
//
// Generalized from the MappingTable and UnmappedTable patterns.
// Supports column definitions, client-side sorting, text filtering,
// and optional row selection with checkboxes.
//
// Usage:
//   <DataTable
//     columns={[
//       { key: 'name', label: 'Name', sortable: true },
//       { key: 'status', label: 'Status', render: (val) => <Badge>{val}</Badge> },
//     ]}
//     data={records}
//     selectable
//     onSelectionChange={(selected) => console.log(selected)}
//     onRowClick={(row) => router.push(`/items/${row.id}`)}
//   />

'use client';

import { useState, useMemo, useCallback } from 'react';

/** Column definition for the DataTable. */
export interface ColumnDef<T> {
  /** Key to access the value from each row object */
  key: keyof T & string;
  /** Display label in the table header */
  label: string;
  /** Whether this column can be sorted (default: false) */
  sortable?: boolean;
  /** Optional custom render function for the cell value */
  render?: (value: T[keyof T], row: T) => React.ReactNode;
}

interface DataTableProps<T extends Record<string, unknown>> {
  /** Column definitions */
  columns: ColumnDef<T>[];
  /** Row data */
  data: T[];
  /** Unique key field on each row (default: 'id') */
  rowKey?: keyof T & string;
  /** Enable row selection with checkboxes */
  selectable?: boolean;
  /** Callback when selection changes — receives array of selected row keys */
  onSelectionChange?: (selectedKeys: string[]) => void;
  /** Callback when a row is clicked */
  onRowClick?: (row: T) => void;
  /** Placeholder text for the search input */
  searchPlaceholder?: string;
  /** Message to show when no rows match */
  emptyMessage?: string;
}

type SortDirection = 'asc' | 'desc';

export function DataTable<T extends Record<string, unknown>>({
  columns,
  data,
  rowKey = 'id' as keyof T & string,
  selectable = false,
  onSelectionChange,
  onRowClick,
  searchPlaceholder = 'Search...',
  emptyMessage = 'No records found.',
}: DataTableProps<T>) {
  const [search, setSearch] = useState('');
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Filter rows by search term across all columns
  const filtered = useMemo(() => {
    if (!search.trim()) return data;
    const term = search.toLowerCase();
    return data.filter((row) =>
      columns.some((col) => {
        const val = row[col.key];
        return val != null && String(val).toLowerCase().includes(term);
      })
    );
  }, [data, search, columns]);

  // Sort filtered rows
  const sorted = useMemo(() => {
    if (!sortColumn) return filtered;
    return [...filtered].sort((a, b) => {
      const aVal = a[sortColumn as keyof T];
      const bVal = b[sortColumn as keyof T];
      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return 1;
      if (bVal == null) return -1;
      const cmp = String(aVal).localeCompare(String(bVal), undefined, { numeric: true });
      return sortDirection === 'asc' ? cmp : -cmp;
    });
  }, [filtered, sortColumn, sortDirection]);

  function handleSort(key: string) {
    if (sortColumn === key) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortColumn(key);
      setSortDirection('asc');
    }
  }

  const toggleSelect = useCallback(
    (key: string) => {
      setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(key)) {
          next.delete(key);
        } else {
          next.add(key);
        }
        onSelectionChange?.(Array.from(next));
        return next;
      });
    },
    [onSelectionChange]
  );

  const toggleSelectAll = useCallback(() => {
    if (selected.size === sorted.length) {
      setSelected(new Set());
      onSelectionChange?.([]);
    } else {
      const allKeys = sorted.map((row) => String(row[rowKey]));
      setSelected(new Set(allKeys));
      onSelectionChange?.(allKeys);
    }
  }, [selected.size, sorted, rowKey, onSelectionChange]);

  return (
    <div className="space-y-4">
      {/* Search bar */}
      <div className="flex items-center gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={searchPlaceholder}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm flex-1 max-w-md"
        />
        <span className="text-sm text-gray-500">
          {sorted.length} record{sorted.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto border border-gray-200 rounded-lg">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              {selectable && (
                <th className="px-4 py-3 w-10">
                  <input
                    type="checkbox"
                    checked={selected.size === sorted.length && sorted.length > 0}
                    onChange={toggleSelectAll}
                    className="rounded border-gray-300"
                  />
                </th>
              )}
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider ${
                    col.sortable ? 'cursor-pointer select-none hover:text-gray-700' : ''
                  }`}
                  onClick={col.sortable ? () => handleSort(col.key) : undefined}
                >
                  <div className="flex items-center gap-1">
                    {col.label}
                    {col.sortable && sortColumn === col.key && (
                      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                        {sortDirection === 'asc' ? (
                          <path d="M5.293 9.707a1 1 0 010-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 01-1.414 1.414L10 6.414l-3.293 3.293a1 1 0 01-1.414 0z" />
                        ) : (
                          <path d="M14.707 10.293a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 111.414-1.414L10 13.586l3.293-3.293a1 1 0 011.414 0z" />
                        )}
                      </svg>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {sorted.map((row) => {
              const key = String(row[rowKey]);
              return (
                <tr
                  key={key}
                  className={`${
                    selected.has(key) ? 'bg-blue-50' : ''
                  } ${onRowClick ? 'cursor-pointer hover:bg-gray-50' : ''}`}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                >
                  {selectable && (
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selected.has(key)}
                        onChange={() => toggleSelect(key)}
                        className="rounded border-gray-300"
                      />
                    </td>
                  )}
                  {columns.map((col) => (
                    <td key={col.key} className="px-4 py-3 text-sm text-gray-900">
                      {col.render
                        ? col.render(row[col.key], row)
                        : row[col.key] != null
                          ? String(row[col.key])
                          : '-'}
                    </td>
                  ))}
                </tr>
              );
            })}
            {sorted.length === 0 && (
              <tr>
                <td
                  colSpan={columns.length + (selectable ? 1 : 0)}
                  className="px-4 py-8 text-center text-gray-500"
                >
                  {emptyMessage}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
