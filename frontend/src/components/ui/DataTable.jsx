import { useState, useMemo, useCallback } from 'react';
import { ChevronUp, ChevronDown, ChevronsUpDown, Search, ChevronLeft, ChevronRight, Inbox, X } from 'lucide-react';
import { DEFAULT_PAGE_SIZE, PAGE_SIZE_OPTIONS } from '@/constants';
import Skeleton from './Skeleton';
import Filtres from './Filtres';

function SortHeader({ column, sortBy, sortDir, onSort }) {
  const title = column.header || column.label || '';
  if (!column.sortable) {
    return <th className="whitespace-nowrap px-4 py-2 text-left text-xs font-medium text-ink-500 first:pl-5">{title}</th>;
  }
  const isActive = sortBy === column.key;
  const Icon = isActive ? (sortDir === 'asc' ? ChevronUp : ChevronDown) : ChevronsUpDown;
  return (
    <th aria-sort={isActive ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'} className="[&>button]:first:pl-5">
      <button
        type="button"
        onClick={() => onSort(column.key)}
        className="flex items-center gap-1 whitespace-nowrap px-4 py-2 text-left text-xs font-medium text-ink-500 hover:text-ink-800"
        aria-label={`Trier par ${title}${isActive ? (sortDir === 'asc' ? ', ordre croissant' : ', ordre décroissant') : ''}`}
      >
        {title}
        <Icon size={12} className={isActive ? 'text-forest-600' : 'text-ink-300'} />
      </button>
    </th>
  );
}

// Chaque ligne est une « carte » bordée aux coins arrondis, séparée de la suivante, qui s'éclaire en vert au survol
const CELLULE = 'whitespace-nowrap border-y border-ink-100 bg-white px-4 py-4 text-sm text-ink-700 transition-colors '
  + 'first:rounded-l-xl first:border-l first:border-l-[3px] first:border-l-forest-200 first:pl-5 '
  + 'last:rounded-r-xl last:border-r last:pr-5 '
  + 'group-hover:border-y-forest-200 group-hover:bg-forest-50/60 first:group-hover:border-l-forest-500 last:group-hover:border-r-forest-200';

const cellule = (col, row) => (col.render ? col.render(row) : (row[col.key] ?? '—'));

/**
 * Tableau : recherche, filtres, tri et pagination dans le navigateur — ou côté serveur avec la prop `serveur`
 * (voir `useListeServeur`) : le tableau n'affiche alors que les lignes reçues (`data` = la page courante) et délègue
 * recherche, tri et changement de page au serveur.
 * - filters : listes de filtres affichées dans la barre du tableau (repliées sur téléphone) ;
 *   filtersActive : nombre de filtres renseignés ; onResetFilters : les remettre à zéro.
 * - Sur téléphone, chaque ligne devient une carte : la 1re colonne sert de titre, les 2 suivantes
 *   (hors `mobile: false`) restent visibles, les autres s'affichent avec « Détails ».
 */
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
  emptyAction,
  // Fonction pure `({ row }) => JSX` appelée directement (et non montée comme composant) : les menus « ⋯ » ouverts
  // gardent leur état quand la page se réaffiche (rechargement de liste, notification qui disparaît…)
  actions: ActionsCell,
  filters,
  filtersActive = 0,
  onResetFilters,
  serveur,
}) {
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState(null);
  const [sortDir, setSortDir] = useState('asc');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSizeState, setPageSize] = useState(pageSize);
  const [expandedRows, setExpandedRows] = useState({});

  const distant = Boolean(serveur);
  const recherche = distant ? serveur.recherche : search;
  const changerRecherche = (valeur) => { if (distant) serveur.onRecherche(valeur); else { setSearch(valeur); setCurrentPage(1); } };
  const triCle = distant ? (serveur.tri?.cle ?? null) : sortBy;
  const triSens = distant ? (serveur.tri?.sens ?? 'asc') : sortDir;

  const handleSort = useCallback((key) => {
    if (distant) { serveur.onTri(key); return; }
    if (sortBy === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(key);
      setSortDir('asc');
    }
  }, [sortBy, distant, serveur]);

  const filtered = useMemo(() => {
    if (distant || !search) return data;
    const keys = searchKeys || columns.map((c) => c.key);
    const lower = search.toLowerCase();
    return data.filter((row) => keys.some((k) => {
      const val = row[k];
      return val != null && String(val).toLowerCase().includes(lower);
    }));
  }, [data, search, searchKeys, columns, distant]);

  const sorted = useMemo(() => {
    if (distant || !sortBy) return filtered;
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
  }, [filtered, sortBy, sortDir, distant]);

  const taillePage = distant ? serveur.pageSize : pageSizeState;
  const totalLignes = distant ? serveur.total : sorted.length;
  const totalPages = distant ? Math.max(1, serveur.pages) : Math.max(1, Math.ceil(sorted.length / pageSizeState));
  const validPage = distant ? serveur.page : Math.min(currentPage, totalPages);
  const paginated = useMemo(() => {
    if (distant) return sorted;
    const start = (validPage - 1) * pageSizeState;
    return sorted.slice(start, start + pageSizeState);
  }, [sorted, validPage, pageSizeState, distant]);
  const allerPage = (n) => { if (distant) serveur.onPage(n); else setCurrentPage(n); };

  const mobileColumns = columns.filter((column) => column.mobile !== false).slice(0, 3);
  const [titreMobile, ...lignesMobile] = mobileColumns;
  const mobileDetailColumns = columns.filter((column) => !mobileColumns.includes(column));
  const sortableColumns = columns.filter((column) => column.sortable);

  const toggleRowDetails = (rowKey) => {
    setExpandedRows((current) => ({ ...current, [rowKey]: !current[rowKey] }));
  };

  const champRecherche = searchable ? (
    <div className="relative w-full sm:w-64">
      <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
      <input
        type="text"
        aria-label={searchPlaceholder}
        value={recherche}
        onChange={(e) => changerRecherche(e.target.value)}
        placeholder={searchPlaceholder}
        className={`w-full text-ellipsis rounded-lg border border-ink-200 bg-cream-50 py-2 pl-9 text-base text-ink-800 placeholder:text-ink-400 transition-colors focus:border-forest-400 focus:ring-2 focus:ring-forest-100 sm:text-sm ${recherche ? 'pr-8' : 'pr-3'}`}
      />
      {recherche && (
        <button type="button" onClick={() => changerRecherche('')} aria-label="Effacer la recherche"
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-sm p-0.5 text-ink-300 hover:text-ink-600">
          <X size={14} />
        </button>
      )}
    </div>
  ) : null;

  // Tri sur téléphone (les en-têtes de colonnes ne sont pas visibles)
  const triMobile = sortableColumns.length > 0 ? (
    <div className="flex items-center gap-2">
      <select
        aria-label="Trier par"
        value={triCle || ''}
        onChange={(event) => { if (distant) serveur.onTri(event.target.value || null, 'asc'); else { setSortBy(event.target.value || null); setSortDir('asc'); setCurrentPage(1); } }}
        className="min-w-0 flex-1 rounded-lg border border-ink-200 bg-white px-2.5 py-2 text-base text-ink-700 sm:text-sm"
      >
        <option value="">Trier : ordre initial</option>
        {sortableColumns.map((column) => <option key={column.key} value={column.key}>Trier par {String(column.header).toLowerCase()}</option>)}
      </select>
      <button
        type="button"
        onClick={() => triCle && handleSort(triCle)}
        disabled={!triCle}
        className="rounded-lg border border-ink-200 bg-white p-2 text-ink-600 disabled:opacity-40"
        aria-label={triSens === 'asc' ? 'Inverser le tri' : 'Trier par ordre croissant'}
      >
        {triSens === 'asc' ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>
    </div>
  ) : null;

  const aUneBarre = champRecherche || filters || triMobile;

  return (
    <div className={`card overflow-hidden ${distant && serveur.actualisation && !loading ? 'opacity-70 transition-opacity' : ''}`} aria-busy={distant && serveur.actualisation}>
      {aUneBarre && (
        <div className="border-b border-ink-100 px-3 py-3.5 sm:px-5">
          <Filtres debut={champRecherche} mobile={triMobile} actifs={filtersActive} onReset={onResetFilters}
            libelle={filters ? 'Filtres' : 'Trier'}>
            {filters}
          </Filtres>
        </div>
      )}

      {/* Grand écran : tableau */}
      <div className="hidden overflow-x-auto bg-cream-50/70 px-3 pb-2 pt-1 md:block">
        <table className="w-full border-separate [border-spacing:0_8px]">
          <thead>
            <tr>
              {columns.map((col) => (
                <SortHeader key={col.key} column={col} sortBy={triCle} sortDir={triSens} onSort={handleSort} />
              ))}
              {ActionsCell && <th className="px-4 py-2 pr-5 text-right text-xs font-medium text-ink-500"><span className="sr-only">Actions</span></th>}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}>
                  {columns.map((col) => (
                    <td key={col.key} className={CELLULE}>
                      <Skeleton className="h-4 w-full max-w-[120px]" />
                    </td>
                  ))}
                  {ActionsCell && <td className={CELLULE}><Skeleton className="h-4 w-16 ml-auto" /></td>}
                </tr>
              ))
            ) : paginated.length === 0 ? (
              <tr>
                <td colSpan={columns.length + (ActionsCell ? 1 : 0)} className="rounded-xl border border-dashed border-ink-200 bg-white px-4 py-12 text-center">
                  <div className="flex flex-col items-center gap-2">
                    <Inbox size={28} className="text-ink-300" />
                    <p className="text-sm font-medium text-ink-700">{recherche ? `Aucun résultat pour « ${recherche} »` : emptyTitle}</p>
                    {emptyMessage && !recherche && <p className="max-w-md text-xs text-ink-500">{emptyMessage}</p>}
                    {emptyAction && !recherche && <div className="mt-2">{emptyAction}</div>}
                  </div>
                </td>
              </tr>
            ) : (
              paginated.map((row, idx) => (
                <tr
                  key={row.id || idx}
                  className={`group ${onRowClick ? 'cursor-pointer' : ''}`}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                >
                  {columns.map((col) => (
                    <td key={col.key} className={CELLULE}>{cellule(col, row)}</td>
                  ))}
                  {ActionsCell && (
                    <td className={`${CELLULE} text-right`} onClick={(e) => e.stopPropagation()}>
                      {ActionsCell({ row })}
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Téléphone : une carte par ligne */}
      <div className="space-y-3 bg-cream-50/70 p-3 md:hidden">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-2 rounded-xl border border-ink-100 bg-white p-4">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
              <Skeleton className="h-3 w-2/3" />
            </div>
          ))
        ) : paginated.length === 0 ? (
          <div className="rounded-xl border border-dashed border-ink-200 bg-white px-4 py-12 text-center">
            <Inbox size={28} className="text-ink-300 mx-auto mb-2" />
            <p className="text-sm font-medium text-ink-700">{recherche ? `Aucun résultat pour « ${recherche} »` : emptyTitle}</p>
            {emptyMessage && !recherche && <p className="mt-1 text-xs text-ink-500">{emptyMessage}</p>}
            {emptyAction && !recherche && <div className="mt-3">{emptyAction}</div>}
          </div>
        ) : (
          paginated.map((row, idx) => {
            const cle = row.id || idx;
            const deplie = !!expandedRows[cle];
            return (
              <div
                key={cle}
                className={`rounded-xl border border-l-[3px] border-ink-100 border-l-forest-300 bg-white px-4 py-4 shadow-xs ${onRowClick ? 'cursor-pointer active:bg-forest-50/60' : ''}`}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
              >
                {titreMobile && <div className="min-w-0 text-sm font-medium text-ink-800">{cellule(titreMobile, row)}</div>}
                {(lignesMobile.length > 0 || deplie) && (
                  <dl className="mt-2 space-y-1.5">
                    {[...lignesMobile, ...(deplie ? mobileDetailColumns : [])].map((col) => (
                      <div key={col.key} className="flex items-center justify-between gap-3">
                        <dt className="shrink-0 text-xs text-ink-500">{col.header || col.label}</dt>
                        <dd className="min-w-0 text-right text-sm text-ink-700">{cellule(col, row)}</dd>
                      </div>
                    ))}
                  </dl>
                )}
                {(mobileDetailColumns.length > 0 || ActionsCell) && (
                  <div className="mt-3 flex items-center justify-between gap-2" onClick={(event) => event.stopPropagation()}>
                    {mobileDetailColumns.length > 0 ? (
                      <button
                        type="button"
                        aria-expanded={deplie}
                        onClick={() => toggleRowDetails(cle)}
                        className="inline-flex items-center gap-1 text-xs font-medium text-forest-700"
                      >
                        {deplie ? 'Moins de détails' : 'Détails'}
                        <ChevronDown size={13} className={`transition-transform ${deplie ? 'rotate-180' : ''}`} />
                      </button>
                    ) : <span />}
                    {ActionsCell && ActionsCell({ row })}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {!loading && totalLignes > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-ink-100 bg-cream-50/60 px-4 py-3 sm:px-5">
          <div className="flex items-center gap-2 text-xs text-ink-500">
            <span>{(validPage - 1) * taillePage + 1}–{Math.min(validPage * taillePage, totalLignes)} sur {totalLignes}</span>
            <select
              value={taillePage}
              onChange={(e) => { if (distant) serveur.onPageSize(Number(e.target.value)); else { setPageSize(Number(e.target.value)); setCurrentPage(1); } }}
              aria-label="Lignes par page"
              className="bg-white border border-ink-200 rounded-sm px-1.5 py-1 text-xs text-ink-600"
            >
              {PAGE_SIZE_OPTIONS.map((s) => (
                <option key={s} value={s}>{s} / page</option>
              ))}
            </select>
          </div>
          {totalPages > 1 && (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => allerPage(Math.max(1, validPage - 1))}
                disabled={validPage <= 1}
                className="p-1.5 rounded-lg text-ink-500 hover:bg-ink-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                aria-label="Page précédente"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="text-xs text-ink-600 px-2 tabular-nums">{validPage} / {totalPages}</span>
              <button
                type="button"
                onClick={() => allerPage(Math.min(totalPages, validPage + 1))}
                disabled={validPage >= totalPages}
                className="p-1.5 rounded-lg text-ink-500 hover:bg-ink-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                aria-label="Page suivante"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
