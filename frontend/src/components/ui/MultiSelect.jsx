import { useMemo, useRef, useState } from 'react';
import { useErreurVisible } from '@/hooks/useErreurVisible';
import { Search, X } from 'lucide-react';

const normalize = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * Sélection multiple avec recherche (cases à cocher).
 * options: [{ value, label, hint? }] — value: tableau des valeurs cochées — onChange(tableau)
 */
export default function MultiSelect({ label, options = [], value = [], onChange, placeholder = 'Rechercher...', error: erreurRecue, hint }) {
  const [query, setQuery] = useState('');
  const racine = useRef(null);
  const error = useErreurVisible(erreurRecue, value, racine);
  const selected = new Set(value);

  const filtered = useMemo(() => {
    const q = normalize(query.trim());
    return q ? options.filter((o) => normalize(`${o.label} ${o.hint || ''}`).includes(q)) : options;
  }, [options, query]);

  const toggle = (v) => onChange(selected.has(v) ? value.filter((x) => x !== v) : [...value, v]);

  return (
    <div ref={racine}>
      {label && <p className="label-base">{label}</p>}

      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {value.map((v) => {
            const opt = options.find((o) => o.value === v);
            return (
              <span key={v} className="inline-flex items-center gap-1 rounded-full bg-forest-50 px-2 py-0.5 text-xs text-forest-700">
                {opt?.label || v}
                <button type="button" onClick={() => toggle(v)} aria-label={`Retirer ${opt?.label || v}`} className="hover:text-earth-600">
                  <X size={12} />
                </button>
              </span>
            );
          })}
        </div>
      )}

      <div className="rounded-lg border border-ink-200 bg-white">
        <div className="relative border-b border-ink-100">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={placeholder}
            className="w-full rounded-t-lg bg-transparent py-2 pl-8 pr-3 text-base text-ink-800 placeholder:text-ink-400 focus:outline-hidden sm:text-sm"
          />
        </div>
        <ul className="max-h-52 overflow-y-auto py-1">
          {filtered.length === 0 && <li className="px-3 py-2 text-sm text-ink-400">Aucun résultat</li>}
          {filtered.map((o) => (
            <li key={o.value}>
              <label className="flex items-center gap-2.5 px-3 py-1.5 text-sm text-ink-700 cursor-pointer hover:bg-cream-50">
                <input
                  type="checkbox"
                  checked={selected.has(o.value)}
                  onChange={() => toggle(o.value)}
                  className="h-4 w-4 rounded-sm border-ink-300 text-forest-600 focus:ring-forest-200"
                />
                <span className="flex-1 truncate">{o.label}</span>
                {o.hint && <span className="text-xs text-ink-400 truncate">{o.hint}</span>}
              </label>
            </li>
          ))}
        </ul>
      </div>
      {error ? <p className="mt-1 text-xs text-earth-600">{error}</p> : hint ? <p className="mt-1 text-xs text-ink-400">{hint}</p> : null}
    </div>
  );
}
