import { STATUS_STYLES } from '@/constants';

const DEFAULT_STYLE = 'bg-ink-100 text-ink-600';

export default function Badge({ children, status, className = '' }) {
  const styleClass = status ? STATUS_STYLES[status] || DEFAULT_STYLE : DEFAULT_STYLE;
  return (
    <span className={`badge ${styleClass} ${className}`}>
      {children}
    </span>
  );
}
