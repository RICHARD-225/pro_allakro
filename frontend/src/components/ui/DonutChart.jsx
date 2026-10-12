import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';

const pourcentage = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });

// Montant abrégé pour le centre de l'anneau : 1,25 M · 850 k
function compact(value) {
  const abs = Math.abs(value);
  if (abs >= 1e6) return `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(value / 1e6)} M`;
  if (abs >= 1e3) return `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(value / 1e3)} k`;
  return new Intl.NumberFormat('fr-FR').format(value);
}

/**
 * Graphique en anneau qui occupe tout son cadre, avec le total au centre et une légende lisible
 * (couleur, libellé, part en %) à côté de l'anneau, ou dessous sur petit écran.
 */
export default function DonutChart({
  data = [],
  colors,
  height = 220,
  formatValue = (v) => v,
  unit = '',
  centerLabel = 'Total',
  tooltipStyle,
  emptyMessage = 'Aucune donnée sur la période',
}) {
  const total = data.reduce((sum, d) => sum + (d.value || 0), 0);
  if (!data.length || total <= 0) {
    return (
      <div className="flex items-center justify-center text-sm text-ink-400" style={{ height }}>
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row">
      <div className="relative w-full sm:w-1/2 shrink-0" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius="60%"
              outerRadius="95%"
              paddingAngle={2}
              stroke="none"
            >
              {data.map((_, i) => <Cell key={i} fill={colors[i % colors.length]} />)}
            </Pie>
            <Tooltip contentStyle={tooltipStyle} formatter={(v) => formatValue(v)} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-xs text-ink-500">{centerLabel}</span>
          <span className="text-base font-semibold tabular-nums text-ink-800">{compact(total)}</span>
          {unit && <span className="text-2xs text-ink-500">{unit}</span>}
        </div>
      </div>

      <ul className="w-full min-w-0 space-y-1.5">
        {data.map((d, i) => (
          <li key={d.name} className="flex items-center gap-2 text-xs">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: colors[i % colors.length] }} />
            <span className="min-w-0 flex-1 truncate text-ink-600" title={`${d.name} : ${formatValue(d.value)}`}>{d.name}</span>
            <span className="shrink-0 font-medium tabular-nums text-ink-700">{pourcentage.format((d.value / total) * 100)} %</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
