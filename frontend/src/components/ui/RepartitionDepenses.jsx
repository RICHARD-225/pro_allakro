import { useState } from 'react';
import { formatFCFA } from '@/utils/format';

/**
 * Répartition des dépenses sous forme de liste classée : libellé, barre, montant et part.
 * Un sélecteur d'axes (campement, bloc, catégorie, activité) change le regroupement.
 * axes : [{ id, label, lignes: [{ name, sous?, value }] }]
 */
export default function RepartitionDepenses({ axes, couleur = '#2f6142' }) {
  const [actif, setActif] = useState(axes[0]?.id);
  const axe = axes.find((a) => a.id === actif) || axes[0];
  const lignes = (axe?.lignes || []).filter((l) => l.value > 0);
  const total = lignes.reduce((t, l) => t + l.value, 0);
  const maximum = Math.max(...lignes.map((l) => l.value), 1);

  return (
    <div>
      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Regrouper les dépenses par">
        {axes.map((a) => (
          <button key={a.id} type="button" role="tab" aria-selected={a.id === actif} onClick={() => setActif(a.id)}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              a.id === actif ? 'border-forest-600 bg-forest-600 text-white' : 'border-ink-200 bg-white text-ink-600 hover:border-forest-300 hover:bg-forest-50'
            }`}>
            {a.label}
          </button>
        ))}
      </div>

      {lignes.length === 0 ? (
        <p className="py-10 text-center text-sm text-ink-500">Aucune dépense sur la période.</p>
      ) : (
        <ul className="mt-4 space-y-2.5">
          {lignes.map((l) => {
            const part = total ? (l.value / total) * 100 : 0;
            return (
              <li key={l.name} className="rounded-xl border border-ink-100 bg-white px-3.5 py-2.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink-800">{l.name}</p>
                    {l.sous && <p className="truncate text-xs text-ink-500">{l.sous}</p>}
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-semibold tabular-nums text-ink-800">{formatFCFA(l.value)}</p>
                    <p className="text-xs tabular-nums text-ink-500">{part.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %</p>
                  </div>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-ink-100" aria-hidden="true">
                  <div className="h-full rounded-full" style={{ width: `${Math.max(3, (l.value / maximum) * 100)}%`, backgroundColor: couleur }} />
                </div>
              </li>
            );
          })}
          <li className="flex items-center justify-between px-1 pt-1 text-sm">
            <span className="text-ink-500">Total</span>
            <span className="font-semibold tabular-nums text-ink-800">{formatFCFA(total)}</span>
          </li>
        </ul>
      )}
    </div>
  );
}
