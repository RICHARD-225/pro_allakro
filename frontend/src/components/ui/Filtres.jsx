import { useState } from 'react';
import { ChevronDown, SlidersHorizontal, X } from 'lucide-react';

/**
 * Barre de filtres sobre.
 * - Grand écran : tout est sur une ligne (recherche, filtres, « Réinitialiser »).
 * - Téléphone : la recherche et un bouton de filtres ; les filtres s'ouvrent dans un panneau.
 *   À côté d'une recherche, le bouton se réduit à son icône (avec le nombre de filtres actifs).
 *
 * debut : élément affiché en premier (champ de recherche) ;
 * children : les filtres (listes déroulantes) ;
 * mobile : éléments ajoutés au panneau sur téléphone seulement (tri) ;
 * actifs : nombre de filtres renseignés ; onReset : remet les filtres à zéro.
 */
export default function Filtres({ debut, children, mobile, actifs = 0, onReset, libelle = 'Filtres', className = '' }) {
  const [ouvert, setOuvert] = useState(false);
  const aDesFiltres = Boolean(children) || Boolean(mobile);
  const reinitialiser = actifs > 0 && onReset;
  const compact = Boolean(debut);

  return (
    <div className={`flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center ${className}`}>
      <div className="flex items-center gap-2 sm:contents">
        {debut && <div className="min-w-0 flex-1 sm:flex-none">{debut}</div>}
        {aDesFiltres && (
          <button
            type="button"
            onClick={() => setOuvert((o) => !o)}
            aria-expanded={ouvert}
            aria-label={actifs > 0 ? `${libelle} (${actifs} actif${actifs > 1 ? 's' : ''})` : libelle}
            title={libelle}
            className={`relative inline-flex shrink-0 items-center gap-1.5 rounded-lg border py-2 text-sm font-medium transition-colors sm:hidden ${
              compact ? 'px-2.5' : 'px-3'
            } ${ouvert || actifs > 0 ? 'border-forest-300 bg-forest-50 text-forest-700' : 'border-ink-200 bg-white text-ink-600'}`}
          >
            <SlidersHorizontal size={16} />
            {!compact && libelle}
            {!compact && <ChevronDown size={14} className={`transition-transform ${ouvert ? 'rotate-180' : ''}`} />}
            {actifs > 0 && (
              <span className={`${compact ? 'absolute -right-1.5 -top-1.5' : ''} rounded-full bg-forest-600 px-1.5 text-2xs font-semibold leading-4 text-white`}>
                {actifs}
              </span>
            )}
          </button>
        )}
      </div>
      {aDesFiltres && (
        <div className={`${ouvert ? 'grid' : 'hidden'} grid-cols-1 gap-2 rounded-lg border border-ink-100 bg-cream-50 p-2 sm:contents`}>
          {children}
          {mobile && <div className="space-y-2 sm:hidden">{mobile}</div>}
          {reinitialiser && (
            <button
              type="button"
              onClick={onReset}
              className="inline-flex items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium text-ink-500 transition-colors hover:text-earth-600"
            >
              <X size={13} /> Réinitialiser
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// Nombre de filtres renseignés (valeurs non vides)
export const compterFiltres = (...valeurs) => valeurs.filter((v) => v !== '' && v !== null && v !== undefined).length;
