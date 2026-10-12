export default function ChartCard({ title, subtitle, action, children, className = '', compact = false }) {
  return (
    <div className={`card animate-fade-in-up ${compact ? 'p-3 sm:p-4' : 'p-5'} ${className}`}>
      <div className={`flex items-start justify-between gap-3 ${compact ? 'mb-2' : 'mb-4'}`}>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-ink-800">{title}</h2>
          {subtitle && <p className="mt-0.5 text-xs text-ink-500">{subtitle}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {children}
    </div>
  );
}
