import { AlertCircle, RefreshCw } from 'lucide-react';
import Button from './Button';

export default function ErrorState({
  message = 'Une erreur est survenue lors du chargement des données.',
  onRetry,
}) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center animate-fade-in">
      <div className="w-14 h-14 rounded-full bg-earth-50 flex items-center justify-center mb-4">
        <AlertCircle size={24} className="text-earth-600" />
      </div>
      <h3 className="text-sm font-semibold text-ink-700">Erreur</h3>
      <p className="mt-1 text-sm text-ink-500 max-w-sm">{message}</p>
      {onRetry && (
        <Button variant="outline" size="sm" className="mt-4" onClick={onRetry}>
          <RefreshCw size={14} />
          Réessayer
        </Button>
      )}
    </div>
  );
}
