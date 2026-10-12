// En-tête de page : titre, sous-titre court et actions (qui passent à la ligne sur téléphone)
export default function PageHeader({ title, subtitle, actions, icon: Icon }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-center gap-3">
        {Icon && (
          <div className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-forest-50 sm:flex">
            <Icon size={20} className="text-forest-600" />
          </div>
        )}
        <div className="min-w-0">
          <h1 className="truncate text-lg font-semibold text-ink-800 sm:text-xl">{title}</h1>
          {subtitle && <p className="mt-0.5 text-sm text-ink-500">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 sm:shrink-0">{actions}</div>}
    </div>
  );
}
