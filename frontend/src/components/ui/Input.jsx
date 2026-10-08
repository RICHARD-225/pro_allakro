import { AlertCircle } from 'lucide-react';

export default function Input({
  label,
  error,
  required = false,
  hint,
  className = '',
  id,
  ...props
}) {
  const inputId = id || `input-${props.name || Math.random().toString(36).slice(2, 8)}`;
  return (
    <div className={className}>
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
        <p className="mt-1 text-xs text-ink-400">{hint}</p>
      ) : null}
    </div>
  );
}
