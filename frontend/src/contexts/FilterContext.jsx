import { createContext, useContext, useState, useCallback, useMemo } from 'react';

const FilterContext = createContext(null);

const DEFAULT_FILTERS = {
  periode: '', // vide = période la plus récente disposant de données (choisie par le serveur)
  plantationId: 'all',
  campementId: 'all',
  blocId: 'all',
  equipeId: 'all',
};

export function FilterProvider({ children }) {
  const [filters, setFilters] = useState(DEFAULT_FILTERS);

  const updateFilter = useCallback((key, value) => {
    setFilters((prev) => {
      const next = { ...prev, [key]: value };
      // Cascade: changing plantation resets campement, etc.
      if (key === 'plantationId') {
        next.campementId = 'all';
        next.blocId = 'all';
      }
      if (key === 'campementId') {
        next.blocId = 'all';
      }
      return next;
    });
  }, []);

  const resetFilters = useCallback(() => setFilters(DEFAULT_FILTERS), []);

  const value = useMemo(
    () => ({ filters, updateFilter, resetFilters }),
    [filters, updateFilter, resetFilters]
  );

  return <FilterContext.Provider value={value}>{children}</FilterContext.Provider>;
}

export function useFilters() {
  const ctx = useContext(FilterContext);
  if (!ctx) throw new Error('useFilters must be used within FilterProvider');
  return ctx;
}
