import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

const SIZES = {
  sm: 'sm:max-w-md',
  md: 'sm:max-w-lg',
  lg: 'sm:max-w-2xl',
  xl: 'sm:max-w-4xl',
};

/**
 * Fenêtre modale : centrée sur grand écran ; sur téléphone, panneau qui monte du bas
 * (pleine largeur, boutons à portée du pouce). Échap ferme la fenêtre du dessus.
 */
export default function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  size = 'md',
}) {
  const fenetre = useRef(null);
  const fermer = useRef(onClose);
  fermer.current = onClose;

  useEffect(() => {
    if (!open) return undefined;
    document.body.style.overflow = 'hidden';
    const origine = document.activeElement;
    const focalisables = () => [...(fenetre.current?.querySelectorAll(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ) || [])].filter((el) => el.offsetParent !== null);
    // Focus dans la fenêtre (elle-même : pas de clavier virtuel qui s'ouvre d'office sur téléphone) ; Tab mène au premier champ
    fenetre.current?.focus({ preventScroll: true });
    const clavier = (e) => {
      const fenetres = document.querySelectorAll('[role=dialog]');
      if (fenetres[fenetres.length - 1] !== fenetre.current) return;
      if (e.key === 'Escape') {
        fermer.current?.();
        return;
      }
      if (e.key !== 'Tab') return;
      const liste = focalisables();
      if (liste.length === 0) {
        e.preventDefault();
        return;
      }
      const premier = liste[0];
      const dernier = liste[liste.length - 1];
      if (e.shiftKey && (document.activeElement === premier || document.activeElement === fenetre.current)) {
        e.preventDefault();
        dernier.focus();
      } else if (!e.shiftKey && document.activeElement === dernier) {
        e.preventDefault();
        premier.focus();
      } else if (!fenetre.current.contains(document.activeElement)) {
        e.preventDefault();
        premier.focus();
      }
    };
    document.addEventListener('keydown', clavier);
    return () => {
      document.removeEventListener('keydown', clavier);
      if (origine && typeof origine.focus === 'function' && document.contains(origine)) origine.focus({ preventScroll: true });
      // La page défile de nouveau quand la dernière fenêtre est fermée
      if (!document.querySelector('[role=dialog]')) document.body.style.overflow = '';
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center animate-fade-in sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-ink-950/40 backdrop-blur-xs" onClick={onClose} />
      <div
        ref={fenetre}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : undefined}
        tabIndex={-1}
        className={`relative outline-hidden flex max-h-[92vh] w-full flex-col rounded-t-2xl bg-white shadow-soft-lg animate-sheet-up sm:max-h-[90vh] sm:rounded-xl sm:animate-scale-in ${SIZES[size]}`}
      >
        <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-ink-200 sm:hidden" aria-hidden="true" />
        {title && (
          <div className="flex items-center justify-between gap-3 border-b border-ink-100 px-4 py-3 sm:px-5 sm:py-4">
            <h2 className="min-w-0 truncate text-base font-semibold text-ink-800">{title}</h2>
            <button
              type="button"
              onClick={onClose}
              className="shrink-0 rounded-lg p-1.5 text-ink-400 transition-colors hover:bg-ink-50 hover:text-ink-600"
              aria-label="Fermer"
            >
              <X size={18} />
            </button>
          </div>
        )}
        <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-5">
          {children}
        </div>
        {footer && (
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-ink-100 bg-cream-50/50 px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:rounded-b-xl sm:px-5 sm:pb-3.5">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
