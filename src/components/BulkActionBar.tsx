// BULK ACTION BAR: Floating action bar shown when rows are selected in a DataTable.
//
// Displays the selection count and provides an action input + apply button.
// Integrates with DataTable's onSelectionChange to know when rows are selected.
//
// Usage:
//   const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
//
//   <BulkActionBar
//     selectedCount={selectedKeys.length}
//     actionLabel="Status"
//     options={['Active', 'Inactive', 'Archived']}
//     onApply={(value) => handleBulkUpdate(selectedKeys, value)}
//     onClear={() => setSelectedKeys([])}
//   />

'use client';

import { useState } from 'react';

interface BulkActionBarProps {
  /** Number of currently selected rows */
  selectedCount: number;
  /** Label for the action (e.g., "Status", "Category") */
  actionLabel: string;
  /** If provided, renders a dropdown instead of a text input */
  options?: string[];
  /** Called when the user clicks Apply with the entered/selected value */
  onApply: (value: string) => void;
  /** Called when the user clicks Clear to deselect all */
  onClear: () => void;
}

export function BulkActionBar({ selectedCount, actionLabel, options, onApply, onClear }: BulkActionBarProps) {
  const [value, setValue] = useState('');

  if (selectedCount === 0) return null;

  function handleApply() {
    if (!value.trim()) return;
    onApply(value.trim());
    setValue('');
  }

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-center gap-3">
      <span className="text-sm font-medium text-blue-800">
        {selectedCount} row{selectedCount !== 1 ? 's' : ''} selected
      </span>

      <div className="flex items-center gap-2 ml-auto">
        <label className="text-sm text-blue-700">Set {actionLabel}:</label>
        {options ? (
          <select
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="border border-blue-300 rounded px-2 py-1 text-sm bg-white"
          >
            <option value="">Select...</option>
            {options.map((opt) => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        ) : (
          <input
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={`Enter ${actionLabel.toLowerCase()}`}
            className="border border-blue-300 rounded px-2 py-1 text-sm"
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleApply();
            }}
          />
        )}
        <button
          onClick={handleApply}
          disabled={!value.trim()}
          className="bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Apply
        </button>
        <button
          onClick={onClear}
          className="text-blue-600 hover:text-blue-800 text-sm px-2 py-1"
        >
          Clear
        </button>
      </div>
    </div>
  );
}
