import React from 'react';
import { InventoryItem } from '../types.ts';
import { EmptyState } from './EmptyState.tsx';
import { SearchInput } from './SearchInput.tsx';
import { IconBox, IconChevronUp, IconChevronDown } from './icons.tsx';

type SortKey = 'fullName' | 'type' | 'specs' | 'serialNumber' | 'stock';

interface EnrichedInventoryItem extends InventoryItem {
    fullName: string;
    specs: string;
}

interface InventoryTableProps {
  inventory: EnrichedInventoryItem[];
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  sortConfig: { key: string; direction: 'asc' | 'desc' };
  setSortConfig: (config: { key: string; direction: 'asc' | 'desc' }) => void;
  onAddStock: () => void;
}

export const InventoryTable: React.FC<InventoryTableProps> = ({ inventory, searchQuery, setSearchQuery, sortConfig, setSortConfig, onAddStock }) => {
  const requestSort = (key: SortKey) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const SortableHeader: React.FC<{ sortKey: SortKey; children: React.ReactNode; className?: string }> = ({ sortKey, children, className }) => {
    const isSorted = sortConfig.key === sortKey;
    return (
      <th scope="col" className={className}>
        <button type="button" onClick={() => requestSort(sortKey)} className="sort-header">
          {children}
          {isSorted ? (
            sortConfig.direction === 'asc' ? <IconChevronUp className="h-3.5 w-3.5" /> : <IconChevronDown className="h-3.5 w-3.5" />
          ) : <span className="w-3.5 h-3.5 inline-block" aria-hidden="true" />}
        </button>
      </th>
    );
  };

  return (
    <div className="card-section-padded">
      <div className="flex justify-end items-center mb-4">
        <SearchInput
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder="Search inventory..."
          className="w-full max-w-xs"
        />
      </div>
      <div className="table-wrap rounded-lg border border-border-color overflow-hidden">
        <table className="data-table">
          <thead>
            <tr>
              <SortableHeader sortKey="fullName">Name</SortableHeader>
              <SortableHeader sortKey="type">Type</SortableHeader>
              <SortableHeader sortKey="specs">Specs</SortableHeader>
              <SortableHeader sortKey="serialNumber">Serial No.</SortableHeader>
              <SortableHeader sortKey="stock">Stock</SortableHeader>
            </tr>
          </thead>
          <tbody>
            {inventory.length > 0 ? inventory.map((item) => (
              <tr key={item.id}>
                <td className="font-medium text-text-primary">{item.fullName}</td>
                <td>
                  <span className={`badge ${item.type === 'New' ? 'badge-green' : 'badge-yellow'}`}>{item.type}</span>
                </td>
                <td>{item.specs}</td>
                <td className="font-mono text-xs">{item.serialNumber}</td>
                <td className="font-bold text-text-primary">{item.stock}</td>
              </tr>
            )) : (
              <tr>
                <td colSpan={5} className="!p-0">
                  <EmptyState
                    icon={<IconBox />}
                    title="No inventory found"
                    message="Add your first item to get started."
                    action={{ label: 'Add New Stock', onClick: onAddStock }}
                    compact
                  />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
