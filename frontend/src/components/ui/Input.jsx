import { useId, useRef } from 'react';
import { useErreurVisible } from '@/hooks/useErreurVisible';
import { AlertCircle } from 'lucide-react';

export default function Input({
  label,
  error: erreurRecue,
  required = false,
  hint,
  className = '',
  id,
  ...props
}) {
  // Identifiant stable (le libellé reste associé au champ d'un rendu à l'autre)
  const autoId = useId();
  const inputId = id || `input-${props.name || autoId}`;
  const racine = useRef(null);
  const error = useErreurVisible(erreurRecue, props.value, racine);
  return (
    <div className={className} ref={racine}>
      {label && (
        <label htmlFor={inputId} className="label-base">
          {label}
          {required && <span className="text-earth-600 ml-0.5">*</span>}
        </label>
      )}
      <input
        id={inputId}
        className={`input-base ${error ? 'border-earth-400 focus:border-earth-400 focus:ring-earth-100' : ''}`}
        aria-invalid={!!error}
        aria-describedby={error ? `${inputId}-error` : undefined}
        {...props}
      />
      {error ? (
        <p id={`${inputId}-error`} className="mt-1 text-xs text-earth-600 flex items-center gap-1">
          <AlertCircle size={12} />
          {error}
        </p>
      ) : hint ? (
        <p className="mt-1 text-xs text-ink-500">{hint}</p>
      ) : null}
    </div>
  );
}
