import { Loader2 } from 'lucide-react';

const VARIANTS = {
  primary: 'bg-forest-600 text-white hover:bg-forest-700 active:bg-forest-800',
  secondary: 'bg-cream-100 text-forest-700 hover:bg-cream-200 border border-ink-200',
  outline: 'bg-white text-ink-700 border border-ink-200 hover:bg-cream-50 hover:border-ink-300',
  ghost: 'text-ink-600 hover:bg-ink-50 hover:text-ink-800',
  danger: 'bg-earth-600 text-white hover:bg-earth-700 active:bg-earth-800',
  success: 'bg-leaf-600 text-white hover:bg-leaf-700',
};

const SIZES = {
  sm: 'px-2.5 py-1.5 text-xs',
  md: 'px-3.5 py-2 text-sm',
  lg: 'px-5 py-2.5 text-sm',
  icon: 'p-2',
};

export default function Button({
  children,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  className = '',
  type = 'button',
  ...props
}) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={`btn ${VARIANTS[variant] || VARIANTS.primary} ${SIZES[size] || SIZES.md} ${className}`}
      {...props}
    >
      {loading && <Loader2 size={16} className="animate-spin" />}
      {children}
    </button>
  );
}
