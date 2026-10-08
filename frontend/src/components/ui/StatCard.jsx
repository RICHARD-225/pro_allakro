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
  const isFlat = evolution === 0 || evolution === undefined;

  const TrendIcon = isUp ? TrendingUp : isDown ? TrendingDown : Minus;
  const trendColor = isUp ? 'text-leaf-600' : isDown ? 'text-earth-600' : 'text-ink-400';

  const iconBg = {
    forest: 'bg-forest-50 text-forest-600',
    leaf: 'bg-leaf-50 text-leaf-600',
    olive: 'bg-olive-50 text-olive-600',
    sage: 'bg-sage-50 text-sage-600',
    earth: 'bg-earth-50 text-earth-600',
  }[accent] || 'bg-forest-50 text-forest-600';

  return (
    <div className={`card animate-fade-in-up ${compact ? 'p-3' : 'p-4'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-ink-500 uppercase tracking-wide truncate">{label}</p>
          <p className={`mt-1.5 font-bold text-ink-800 tabular-nums ${compact ? 'text-lg sm:text-xl' : 'text-2xl'}`}>
            {value}
            {unit && <span className="text-sm font-medium text-ink-400 ml-1">{unit}</span>}
          </p>
          {(evolution !== undefined || period) && (
            <div className="mt-2 flex items-center gap-2">
              {evolution !== undefined && (
                <span className={`flex items-center gap-0.5 text-xs font-medium ${trendColor}`}>
                  <TrendIcon size={12} />
                  {isUp ? '+' : ''}{evolution}%
                </span>
              )}
              {evolutionLabel && (
                <span className="text-xs text-ink-400 truncate">{evolutionLabel}</span>
              )}
              {period && !evolutionLabel && (
                <span className="text-xs text-ink-400">{period}</span>
              )}
            </div>
          )}
        </div>
        {Icon && (
          <div className={`shrink-0 w-10 h-10 rounded-lg flex items-center justify-center ${iconBg}`}>
            <Icon size={20} />
          </div>
        )}
      </div>
    </div>
  );
}
