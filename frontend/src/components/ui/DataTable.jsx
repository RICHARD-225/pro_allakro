import { useState, useMemo, useCallback } from 'react';
import { ChevronUp, ChevronDown, ChevronsUpDown, Search, ChevronLeft, ChevronRight, Inbox } from 'lucide-react';
import { DEFAULT_PAGE_SIZE, PAGE_SIZE_OPTIONS } from '@/constants';
import Skeleton from './Skeleton';

function SortHeader({ column, sortBy, sortDir, onSort }) {
  const title = column.header || column.label || '';
  if (!column.sortable) {
    return <th className="px-4 py-3 text-left text-xs font-medium text-ink-500 uppercase tracking-wide whitespace-nowrap">{title}</th>;
  }
  const isActive = sortBy === column.key;
  const Icon = isActive ? (sortDir === 'asc' ? ChevronUp : ChevronDown) : ChevronsUpDown;
  return (
    <th aria-sort={isActive ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button
        type="button"
        onClick={() => onSort(column.key)}
        className="flex items-center gap-1 whitespace-nowrap px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-ink-500 hover:text-ink-700"
        aria-label={`Trier par ${title}${isActive ? (sortDir === 'asc' ? ', ordre croissant' : ', ordre décroissant') : ''}`}
      >
        {title}
        <Icon size={12} className={isActive ? 'text-forest-600' : 'text-ink-300'} />
      </button>
    </th>
  );
}

export default function DataTable({
  columns = [],
  data = [],
  loading = false,
  searchable = true,
  searchPlaceholder = 'Rechercher...',
  searchKeys,
  pageSize = DEFAULT_PAGE_SIZE,
  onRowClick,
  emptyTitle = 'Aucune donnée',
  emptyMessage = '',
  actions: ActionsCell,
}) {
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState(null);
  const [sortDir, setSortDir] = useState('asc');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSizeState, setPageSize] = useState(pageSize);
  const [expandedRows, setExpandedRows] = useState({});

  const handleSort = useCallback((key) => {
    if (sortBy === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(key);
      setSortDir('asc');
    }
  }, [sortBy]);

  // Filter
  const filtered = useMemo(() => {
    if (!search) return data;
    const keys = searchKeys || columns.map((c) => c.key);
    const lower = search.toLowerCase();
    return data.filter((row) =>
      keys.some((k) => {
        const val = row[k];
        return val != null && String(val).toLowerCase().includes(lower);
      })
    );
  }, [data, search, searchKeys, columns]);

  // Sort
  const sorted = useMemo(() => {
    if (!sortBy) return filtered;
    return [...filtered].sort((a, b) => {
      const aVal = a[sortBy];
      const bVal = b[sortBy];
      if (aVal == null) return 1;
      if (bVal == null) return -1;
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
      }
      const cmp = String(aVal).localeCompare(String(bVal), 'fr', { numeric: true });
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [filtered, sortBy, sortDir]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSizeState));
  const validPage = Math.min(currentPage, totalPages);
  const paginated = useMemo(() => {
    const start = (validPage - 1) * pageSizeState;
    return sorted.slice(start, start + pageSizeState);
  }, [sorted, validPage, pageSizeState]);
  const mobileColumns = columns.filter((column) => column.mobile !== false).slice(0, 3);
  const mobileDetailColumns = columns.filter((column) => !mobileColumns.includes(column));

  const toggleRowDetails = (rowKey) => {
    setExpandedRows((current) => ({ ...current, [rowKey]: !current[rowKey] }));
  };

  return (
    <div className="card overflow-hidden">
      {/* Search bar */}
      {searchable && (
        <div className="px-4 py-3 border-b border-ink-100">
          <div className="relative max-w-xs">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
            <input
              type="text"
              aria-label={searchPlaceholder}
              value={search}
              onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
              placeholder={searchPlaceholder}
              className="w-full pl-9 pr-3 py-2 text-sm bg-cream-50 border border-ink-200 rounded-lg text-ink-800 placeholder:text-ink-400 focus:border-forest-400 focus:ring-2 focus:ring-forest-100 transition-colors"
            />
          </div>
        </div>
      )}

      {columns.some((column) => column.sortable) && (
        <div className="flex items-center gap-2 border-b border-ink-100 px-4 py-2 md:hidden">
          <label htmlFor="mobile-table-sort" className="text-xs text-ink-500">Trier</label>
          <select
            id="mobile-table-sort"
            value={sortBy || ''}
            onChange={(event) => {
              setSortBy(event.target.value || null);
              setSortDir('asc');
              setCurrentPage(1);
            }}
            className="min-w-0 flex-1 rounded-md border border-ink-200 bg-white px-2 py-1.5 text-xs text-ink-700"
          >
            <option value="">Ordre initial</option>
            {columns.filter((column) => column.sortable).map((column) => (
              <option key={column.key} value={column.key}>{column.header}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => sortBy && handleSort(sortBy)}
            disabled={!sortBy}
            className="rounded-md border border-ink-200 p-1.5 text-ink-600 disabled:opacity-40"
            aria-label={sortDir === 'asc' ? 'Inverser le tri' : 'Trier par ordre croissant'}
          >
            {sortDir === 'asc' ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        </div>
      )}

      {/* Desktop table */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full">
          <thead className="bg-cream-50/50 border-b border-ink-100">
            <tr>
              {columns.map((col) => (
                <SortHeader key={col.key} column={col} sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
              ))}
              {ActionsCell && <th className="px-4 py-3 text-right text-xs font-medium text-ink-500 uppercase tracking-wide">Actions</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100/60">
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}>
                  {columns.map((col) => (
                    <td key={col.key} className="px-4 py-3">
                      <Skeleton className="h-4 w-full max-w-[120px]" />
                    </td>
                  ))}
                  {ActionsCell && <td className="px-4 py-3"><Skeleton className="h-4 w-16 ml-auto" /></td>}
                </tr>
              ))
            ) : paginated.length === 0 ? (
              <tr>
                <td colSpan={columns.length + (ActionsCell ? 1 : 0)} className="px-4 py-12 text-center">
                  <div className="flex flex-col items-center gap-2">
                    <Inbox size={28} className="text-ink-300" />
                    <p className="text-sm text-ink-500">{emptyTitle}</p>
                    {emptyMessage && <p className="text-xs text-ink-400">{emptyMessage}</p>}
                  </div>
                </td>
              </tr>
            ) : (
              paginated.map((row, idx) => (
                <tr
                  key={row.id || idx}
                  className={`table-row-hover transition-colors ${onRowClick ? 'cursor-pointer' : ''}`}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                >
                  {columns.map((col) => (
                    <td key={col.key} className="px-4 py-3 text-sm text-ink-700 whitespace-nowrap">
                      {col.render ? col.render(row) : (row[col.key] ?? '—')}
                    </td>
                  ))}
                  {ActionsCell && (
                    <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                      <ActionsCell row={row} />
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden divide-y divide-ink-100/60">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="p-4 space-y-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
              <Skeleton className="h-3 w-2/3" />
            </div>
          ))
        ) : paginated.length === 0 ? (
          <div className="px-4 py-12 text-center">
            <Inbox size={28} className="text-ink-300 mx-auto mb-2" />
            <p className="text-sm text-ink-500">{emptyTitle}</p>
          </div>
        ) : (
          paginated.map((row, idx) => (
            <div key={row.id || idx}>
              <div
                className={`p-4 ${onRowClick ? 'cursor-pointer active:bg-cream-50' : ''}`}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
              >
                {mobileColumns.map((col) => (
                  <div key={col.key} className="flex items-center justify-between gap-3 py-0.5">
                    <span className="shrink-0 text-xs text-ink-400">{col.header || col.label}</span>
                    <span className="truncate text-right text-sm text-ink-700">
                      {col.render ? col.render(row) : (row[col.key] ?? '—')}
                    </span>
                  </div>
                ))}
                {expandedRows[row.id || idx] && mobileDetailColumns.map((col) => (
                  <div key={col.key} className="flex items-center justify-between gap-3 py-0.5">
                    <span className="shrink-0 text-xs text-ink-400">{col.header || col.label}</span>
                    <span className="text-right text-sm text-ink-700">
                      {col.render ? col.render(row) : (row[col.key] ?? '—')}
                    </span>
                  </div>
                ))}
                <div className="mt-2 flex items-center justify-between" onClick={(event) => event.stopPropagation()}>
                  {mobileDetailColumns.length > 0 && (
                    <button
                      type="button"
                      aria-expanded={!!expandedRows[row.id || idx]}
                      onClick={() => toggleRowDetails(row.id || idx)}
                      className="text-xs font-medium text-forest-700 underline-offset-2 hover:underline"
                    >
                      {expandedRows[row.id || idx] ? 'Réduire les détails' : 'Voir tous les détails'}
                    </button>
                  )}
                  {ActionsCell && <ActionsCell row={row} />}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Pagination */}
      {!loading && sorted.length > 0 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t border-ink-100 bg-cream-50/30">
          <div className="flex items-center gap-2 text-xs text-ink-500">
            <span>{(validPage - 1) * pageSizeState + 1}–{Math.min(validPage * pageSizeState, sorted.length)} sur {sorted.length}</span>
            <select
              value={pageSizeState}
              onChange={(e) => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}
              className="bg-white border border-ink-200 rounded px-1.5 py-1 text-xs text-ink-600"
            >
              {PAGE_SIZE_OPTIONS.map((s) => (
                <option key={s} value={s}>{s} / page</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={validPage <= 1}
              className="p-1.5 rounded-lg text-ink-500 hover:bg-ink-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              aria-label="Page précédente"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="text-xs text-ink-600 px-2 tabular-nums">
              {validPage} / {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={validPage >= totalPages}
              className="p-1.5 rounded-lg text-ink-500 hover:bg-ink-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              aria-label="Page suivante"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
