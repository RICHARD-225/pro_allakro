import StatCard from './StatCard';

const ICONE = {
  forest: 'text-forest-600',
  leaf: 'text-leaf-600',
  olive: 'text-olive-600',
  sage: 'text-sage-600',
  earth: 'text-earth-600',
};

// Classes écrites en entier pour que Tailwind les génère
const GRILLE = {
  2: 'sm:grid-cols-2',
  3: 'sm:grid-cols-3',
  4: 'sm:grid-cols-2 lg:grid-cols-4',
  5: 'sm:grid-cols-3 xl:grid-cols-5',
};

/**
 * Indicateurs clés d'une page.
 * - Téléphone : une seule carte, une ligne par indicateur (libellé à gauche, valeur à droite) : rien n'est coupé.
 * - Grand écran : une carte par indicateur.
 * items : [{ label, value, unit?, icon?, accent?, hint?, evolution?, evolutionLabel? }]
 */
export default function KpiGrid({ items = [], className = '' }) {
  const visibles = items.filter(Boolean);
  return (
    <div className={className}>
      <div className="card divide-y divide-ink-100 sm:hidden">
        {visibles.map((k) => {
          const Icone = k.icon;
          return (
            <div key={k.label} className="flex items-center justify-between gap-3 px-4 py-2.5">
              <div className="flex min-w-0 items-center gap-2.5">
                {Icone && <Icone size={16} className={`shrink-0 ${ICONE[k.accent] || ICONE.forest}`} />}
                <div className="min-w-0">
                  <p className="text-[13px] text-ink-600">{k.label}</p>
                  {k.hint && <p className="text-2xs text-ink-500">{k.hint}</p>}
                </div>
              </div>
              <p className="shrink-0 text-right text-[15px] font-semibold tabular-nums text-ink-800">
                {k.value}
                {k.unit && <span className="ml-1 text-xs font-normal text-ink-500">{k.unit}</span>}
              </p>
            </div>
          );
        })}
      </div>
      <div className={`hidden gap-3 sm:grid ${GRILLE[visibles.length] || 'sm:grid-cols-2 lg:grid-cols-4'}`}>
        {visibles.map((k) => (
          <StatCard key={k.label} compact label={k.label} value={k.value} unit={k.unit} icon={k.icon} accent={k.accent}
            period={k.hint} evolution={k.evolution} evolutionLabel={k.evolutionLabel} />
        ))}
      </div>
    </div>
  );
}
