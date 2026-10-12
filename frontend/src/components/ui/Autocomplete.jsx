import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { AlertCircle, Check, Plus } from 'lucide-react';
import { useErreurVisible } from '@/hooks/useErreurVisible';

// Comparaison sans accents, sans majuscules et sans espaces en trop (comme le serveur)
export const normaliser = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/\s+/g, ' ').trim().toLowerCase();

/**
 * Saisie libre avec propositions : les valeurs existantes qui correspondent sont proposées pendant la frappe ;
 * une valeur absente de la liste est acceptée (le serveur la créera, sans doublon d'écriture).
 */
export default function Autocomplete({
  label, value = '', onChange, suggestions = [], required = false, error: erreurRecue, hint, placeholder,
  libelleNouveau = 'Nouvelle valeur', className = '',
}) {
  const [ouvert, setOuvert] = useState(false);
  const [actif, setActif] = useState(0);
  const racine = useRef(null);
  const error = useErreurVisible(erreurRecue, value, racine);
  const id = useId();
  const saisie = normaliser(value);

  const proposees = useMemo(
    () => suggestions.filter((s) => !saisie || normaliser(s).includes(saisie)).slice(0, 8),
    [suggestions, saisie],
  );
  const existante = suggestions.find((s) => normaliser(s) === saisie);

  useEffect(() => {
    const fermer = (e) => { if (racine.current && !racine.current.contains(e.target)) setOuvert(false); };
    document.addEventListener('mousedown', fermer);
    return () => document.removeEventListener('mousedown', fermer);
  }, []);

  const choisir = (valeur) => { onChange(valeur); setOuvert(false); };

  const clavier = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOuvert(true); setActif((i) => Math.min(i + 1, proposees.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActif((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter' && ouvert && proposees[actif]) { e.preventDefault(); choisir(proposees[actif]); }
    else if (e.key === 'Escape') {
      // Ferme les propositions sans fermer la fenêtre qui les contient
      if (ouvert) e.stopPropagation();
      setOuvert(false);
    }
  };

  // En quittant le champ, une saisie équivalente à une valeur existante prend son écriture officielle
  const quitter = () => { if (existante && existante !== value) onChange(existante); };

  return (
    <div ref={racine} className={`relative ${className}`}>
      {label && (
        <label htmlFor={id} className="label-base">
          {label}
          {required && <span className="text-earth-600 ml-0.5">*</span>}
        </label>
      )}
      <input
        id={id}
        role="combobox"
        aria-expanded={ouvert && proposees.length > 0}
        aria-controls={`${id}-liste`}
        aria-autocomplete="list"
        autoComplete="off"
        className={`input-base ${error ? 'border-earth-400 focus:border-earth-400 focus:ring-earth-100' : ''}`}
        placeholder={placeholder}
        value={value}
        onChange={(e) => { onChange(e.target.value); setOuvert(true); setActif(0); }}
        onFocus={() => setOuvert(true)}
        onBlur={quitter}
        onKeyDown={clavier}
      />
      {ouvert && proposees.length > 0 && (
        <ul id={`${id}-liste`} role="listbox"
          className="absolute z-30 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-ink-100 bg-white py-1 shadow-soft-lg">
          {proposees.map((s, i) => (
            <li key={s} role="option" aria-selected={i === actif}>
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => choisir(s)}
                className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm ${i === actif ? 'bg-forest-50 text-forest-800' : 'text-ink-700 hover:bg-cream-50'}`}>
                {s}
                {normaliser(s) === saisie && <Check size={14} className="text-forest-600" />}
              </button>
            </li>
          ))}
        </ul>
      )}
      {error ? (
        <p className="mt-1 flex items-center gap-1 text-xs text-earth-600"><AlertCircle size={12} />{error}</p>
      ) : value.trim() && !existante ? (
        <p className="mt-1 flex items-center gap-1 text-xs text-forest-700"><Plus size={12} />{libelleNouveau} : « {value.trim().replace(/\s+/g, ' ')} »</p>
      ) : hint ? (
        <p className="mt-1 text-xs text-ink-500">{hint}</p>
      ) : null}
    </div>
  );
}
