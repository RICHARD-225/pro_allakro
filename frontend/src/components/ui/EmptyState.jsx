import { Inbox } from 'lucide-react';
import Button from './Button';

export default function EmptyState({
  icon: Icon = Inbox,
  title = 'Aucune donnée',
  message = '',
  actionLabel,
  onAction,
}) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center animate-fade-in">
      <div className="w-14 h-14 rounded-full bg-cream-100 flex items-center justify-center mb-4">
        <Icon size={24} className="text-ink-400" />
      </div>
      <h3 className="text-sm font-semibold text-ink-700">{title}</h3>
      {message && <p className="mt-1 text-sm text-ink-400 max-w-sm">{message}</p>}
      {actionLabel && onAction && (
        <Button variant="primary" size="sm" className="mt-4" onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
