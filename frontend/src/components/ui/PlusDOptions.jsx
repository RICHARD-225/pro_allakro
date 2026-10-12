import { useState } from 'react';
import { ChevronDown } from 'lucide-react';

/**
 * Champs facultatifs repliés sous « Plus d'options » : le formulaire montre d'abord l'essentiel.
 * ouvertParDefaut : à passer à true quand l'un des champs est déjà renseigné (modification).
 * resume : court rappel affiché quand le bloc est fermé (ex. « Observation, nombre de jours »).
 */
export default function PlusDOptions({ titre = "Plus d'options", resume, ouvertParDefaut = false, children }) {
  const [ouvert, setOuvert] = useState(ouvertParDefaut);

  return (
    <div className="rounded-lg border border-ink-100">
      <button
        type="button"
        onClick={() => setOuvert((o) => !o)}
        aria-expanded={ouvert}
        className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-cream-50"
      >
        <span className="min-w-0">
          <span className="text-sm font-medium text-ink-700">{titre}</span>
          {resume && !ouvert && <span className="ml-2 text-xs text-ink-500">{resume}</span>}
        </span>
        <ChevronDown size={16} className={`shrink-0 text-ink-500 transition-transform ${ouvert ? 'rotate-180' : ''}`} />
      </button>
      {ouvert && <div className="space-y-3 border-t border-ink-100 px-3 py-3">{children}</div>}
    </div>
  );
}
