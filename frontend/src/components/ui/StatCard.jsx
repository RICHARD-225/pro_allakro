import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

export default function StatCard({
  label,
  value,
  unit,
  evolution,
  evolutionLabel,
  icon: Icon,
  accent = 'forest',
  period,
  compact = false,
}) {
  const isUp = evolution > 0;
  const isDown = evolution < 0;

  const TrendIcon = isUp ? TrendingUp : isDown ? TrendingDown : Minus;
  const trendColor = isUp ? 'text-earth-600' : isDown ? 'text-leaf-600' : 'text-ink-400';

  const iconBg = {
    forest: 'bg-forest-50 text-forest-600',
    leaf: 'bg-leaf-50 text-leaf-600',
    olive: 'bg-olive-50 text-olive-600',
    sage: 'bg-sage-50 text-sage-600',
    earth: 'bg-earth-50 text-earth-600',
  }[accent] || 'bg-forest-50 text-forest-600';

  return (
    <div className={`card ${compact ? 'p-3.5' : 'p-4'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {/* Le libellé passe à la ligne plutôt que d'être coupé */}
          <p className="text-xs font-medium leading-snug text-ink-500">{label}</p>
          <p className={`mt-1 font-semibold tracking-tight text-ink-800 tabular-nums ${compact ? 'text-lg xl:text-xl' : 'text-2xl'}`}>
            {value}
            {unit && <span className="ml-1 text-sm font-normal text-ink-500">{unit}</span>}
          </p>
          {(evolution !== undefined || period) && (
            <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
              {evolution !== undefined && (
                <span className={`flex items-center gap-0.5 text-xs font-medium ${trendColor}`}>
                  <TrendIcon size={12} />
                  {isUp ? '+' : ''}{evolution}%
                </span>
              )}
              {evolutionLabel && <span className="text-xs text-ink-500">{evolutionLabel}</span>}
              {period && !evolutionLabel && <span className="text-xs text-ink-500">{period}</span>}
            </div>
          )}
        </div>
        {Icon && (
          <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${iconBg}`}>
            <Icon size={18} />
          </div>
        )}
      </div>
    </div>
  );
}
