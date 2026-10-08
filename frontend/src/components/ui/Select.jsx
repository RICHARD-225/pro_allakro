import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { ChevronDown, Check, Plus, X } from 'lucide-react';

const normalize = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * Liste déroulante avec recherche : on tape pour filtrer les options.
 * API compatible avec un <select> : onChange reçoit { target: { value, name } }.
 * - creatable + onCreate(texte) : propose « Ajouter "texte" » quand aucune option ne correspond.
 */
export default function Select({
  label,
  error,
  required = false,
  options = [],
  placeholder = 'Sélectionner...',
  className = '',
  id,
  name,
  value = '',
  onChange,
  disabled = false,
  creatable = false,
  onCreate,
  hint,
}) {
  const autoId = useId();
  const selectId = id || `select-${name || autoId}`;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const rootRef = useRef(null);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  const items = useMemo(() => options.map((opt) => (
    typeof opt === 'object' ? { value: String(opt.value), label: String(opt.label) } : { value: String(opt), label: String(opt) }
  )), [options]);

  const selected = items.find((o) => o.value === String(value ?? ''));

  const filtered = useMemo(() => {
    const q = normalize(query.trim());
    return q ? items.filter((o) => normalize(o.label).includes(q)) : items;
  }, [items, query]);

  const canCreate = creatable && onCreate && query.trim()
    && !items.some((o) => normalize(o.label) === normalize(query.trim()));

  // Entrées affichées : option « vide » (placeholder) + options filtrées + création éventuelle
  const entries = [
    ...(placeholder && !query ? [{ value: '', label: placeholder, empty: true }] : []),
    ...filtered,
    ...(canCreate ? [{ value: '__create__', label: query.trim(), create: true }] : []),
  ];

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (!rootRef.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  useEffect(() => { setActive(0); }, [query, open]);

  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView?.({ block: 'nearest' });
  }, [active]);

  const emit = (v) => onChange?.({ target: { value: v, name } });

  const choose = (entry) => {
    if (entry.create) onCreate(entry.label);
    else emit(entry.value);
    setOpen(false);
    setQuery('');
    inputRef.current?.blur();
  };

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, entries.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter') { if (open && entries[active]) { e.preventDefault(); choose(entries[active]); } }
    else if (e.key === 'Escape') { setOpen(false); setQuery(''); }
    else if (e.key === 'Tab') { setOpen(false); setQuery(''); }
  };

  return (
    <div className={className} ref={rootRef}>
      {label && (
        <label htmlFor={selectId} className="label-base">
          {label}
          {required && <span className="text-earth-600 ml-0.5">*</span>}
        </label>
      )}
      <div className="relative">
        <input
          ref={inputRef}
          id={selectId}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={`${selectId}-list`}
          aria-invalid={!!error}
          autoComplete="off"
          disabled={disabled}
          className={`input-base pr-14 ${selected ? '' : 'placeholder:text-ink-400'} ${error ? 'border-earth-400' : ''} ${disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
          placeholder={selected ? selected.label : placeholder}
          value={open ? query : (selected?.label ?? '')}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onClick={() => setOpen(true)}
          onKeyDown={onKeyDown}
        />
        {selected && placeholder && !disabled && (
          <button
            type="button"
            onClick={() => emit('')}
            className="absolute right-8 top-1/2 -translate-y-1/2 p-0.5 rounded text-ink-300 hover:text-ink-600"
            aria-label="Effacer la sélection"
            tabIndex={-1}
          >
            <X size={14} />
          </button>
        )}
        <ChevronDown size={16} className={`absolute right-3 top-1/2 -translate-y-1/2 text-ink-400 pointer-events-none transition-transform ${open ? 'rotate-180' : ''}`} />

        {open && !disabled && (
          <ul
            ref={listRef}
            id={`${selectId}-list`}
            role="listbox"
            className="absolute z-40 mt-1 w-full max-h-60 overflow-y-auto rounded-lg border border-ink-100 bg-white py-1 shadow-soft-lg"
          >
            {entries.length === 0 && (
              <li className="px-3 py-2 text-sm text-ink-400">Aucun résultat</li>
            )}
            {entries.map((entry, i) => (
              <li
                key={`${entry.value}-${i}`}
                data-index={i}
                role="option"
                aria-selected={entry.value === String(value ?? '')}
                onMouseDown={(e) => { e.preventDefault(); choose(entry); }}
                onMouseEnter={() => setActive(i)}
                className={`flex items-center justify-between gap-2 px-3 py-2 text-sm cursor-pointer ${
                  i === active ? 'bg-cream-100' : ''
                } ${entry.empty ? 'text-ink-400' : 'text-ink-700'} ${entry.create ? 'text-forest-700 font-medium' : ''}`}
              >
                <span className="flex items-center gap-1.5 truncate">
                  {entry.create && <Plus size={14} />}
                  {entry.create ? `Ajouter « ${entry.label} »` : entry.label}
                </span>
                {!entry.empty && !entry.create && entry.value === String(value ?? '') && <Check size={14} className="text-forest-600 shrink-0" />}
              </li>
            ))}
          </ul>
        )}
      </div>
      {error ? <p className="mt-1 text-xs text-earth-600">{error}</p> : hint ? <p className="mt-1 text-xs text-ink-400">{hint}</p> : null}
    </div>
  );
}
