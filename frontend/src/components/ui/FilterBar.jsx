import { SlidersHorizontal, X } from 'lucide-react';
import Select from './Select';

// Reusable filter bar — used across pages with global filter context
export default function FilterBar({ filters = [], onReset, className = '' }) {
  return (
    <div className={`flex flex-wrap items-end gap-3 ${className}`}>
      <div className="flex items-center gap-2 text-sm text-ink-500 shrink-0">
        <SlidersHorizontal size={16} />
        <span className="font-medium hidden sm:inline">Filtres</span>
      </div>
      {filters.map((f) => (
        <Select
          key={f.key}
          label={f.label}
          options={f.options}
          value={f.value}
          onChange={(e) => f.onChange(e.target.value)}
          placeholder={f.placeholder || 'Tous'}
          className="min-w-[140px] flex-1 max-w-[200px]"
        />
      ))}
      {onReset && (
        <button
          onClick={onReset}
          className="flex items-center gap-1 px-3 py-2 text-xs text-ink-500 hover:text-earth-600 transition-colors"
        >
          <X size={14} />
          Réinitialiser
        </button>
      )}
    </div>
  );
}
