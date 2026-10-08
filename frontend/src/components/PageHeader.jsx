// Reusable page header for all pages
export default function PageHeader({ title, subtitle, actions, icon: Icon }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
      <div className="flex items-center gap-3 min-w-0">
        {Icon && (
          <div className="shrink-0 w-10 h-10 rounded-lg bg-forest-50 flex items-center justify-center">
            <Icon size={20} className="text-forest-600" />
          </div>
        )}
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-ink-800 truncate">{title}</h1>
          {subtitle && <p className="text-sm text-ink-400 mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}
