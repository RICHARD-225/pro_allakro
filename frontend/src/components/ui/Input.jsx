import { useId, useRef, useState } from 'react';
import { useErreurVisible } from '@/hooks/useErreurVisible';
import { AlertCircle, Eye, EyeOff } from 'lucide-react';

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
  // Champ mot de passe : bouton pour voir ce qu'on tape
  const [visible, setVisible] = useState(false);
  const estMotDePasse = props.type === 'password';
  return (
    <div className={className} ref={racine}>
      {label && (
        <label htmlFor={inputId} className="label-base">
          {label}
          {required && <span className="text-earth-600 ml-0.5">*</span>}
        </label>
      )}
      <div className={estMotDePasse ? 'relative' : undefined}>
        <input
          id={inputId}
          className={`input-base ${estMotDePasse ? 'pr-10' : ''} ${error ? 'border-earth-400 focus:border-earth-400 focus:ring-earth-100' : ''}`}
          aria-invalid={!!error}
          aria-describedby={error ? `${inputId}-error` : undefined}
          {...props}
          type={estMotDePasse && visible ? 'text' : props.type}
        />
        {estMotDePasse && (
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            aria-label={visible ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
            aria-pressed={visible}
            className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-ink-500 hover:text-ink-700"
          >
            {visible ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        )}
      </div>
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
