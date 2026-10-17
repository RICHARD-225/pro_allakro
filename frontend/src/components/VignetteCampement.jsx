import { TreePine } from 'lucide-react';

/**
 * Vignette d'un campement dans les listes : tuile à bordure verte (comme les pastilles des autres listes) avec l'icône du campement
 * et, en coin, le nombre de blocs. Un campement inactif est grisé.
 */
export default function VignetteCampement({ campement }) {
  const inactif = campement.actif === false;
  return (
    <div
      className={`relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border shadow-sm ${
        inactif ? 'border-ink-200 bg-ink-50 text-ink-400' : 'border-forest-200 bg-forest-50 text-forest-700'}`}
      aria-hidden="true"
    >
      <TreePine size={22} />
      <span
        className={`absolute -bottom-1.5 -right-1.5 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-white px-1 text-2xs font-semibold tabular-nums text-white ${
          inactif ? 'bg-ink-400' : 'bg-forest-600'}`}
      >
        {campement.nb_blocs ?? 0}
      </span>
    </div>
  );
}
