import { STATUS_STYLES } from '@/constants';

const DEFAULT_STYLE = 'bg-ink-100 text-ink-600';

export default function Badge({ children, status, className = '' }) {
  // Couleurs du statut, sinon celles passées en className (bg-…), sinon le style neutre
  const styleClass = status ? STATUS_STYLES[status] || DEFAULT_STYLE : (/(^|\s)bg-/.test(className) ? '' : DEFAULT_STYLE);
  return (
    <span className={`badge ${styleClass} ${className}`}>
      {children}
    </span>
  );
}
