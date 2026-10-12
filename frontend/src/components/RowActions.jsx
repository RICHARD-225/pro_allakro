import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Eye, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';

const BOUTON = 'rounded-lg p-2.5 text-ink-500 transition-colors hover:bg-forest-50 hover:text-forest-700 disabled:cursor-not-allowed disabled:opacity-35 md:p-1.5';

/**
 * Actions d'une ligne de tableau, sans encombrer :
 * - visibles : les actions principales de la page (`children`, ex. « Payer ») et « Modifier » ;
 * - menu « ⋯ » : « Voir le détail », les actions secondaires (`menu`) et « Supprimer » (en dernier, en rouge).
 * menu : [{ label, icon?, onClick, danger?, disabled?, title? }]
 * menuButtonClassName : apparence du bouton « ⋯ » (ex. bouton encadré dans le pied d'une fiche).
 * Le clic ne déclenche pas l'ouverture de la ligne.
 */
export default function RowActions({
  onView, onEdit, onDelete, editDisabled = false, deleteDisabled = false, editTitle, deleteTitle, menu = [], menuButtonClassName,
  children,
}) {
  const [ouvert, setOuvert] = useState(false);
  const [position, setPosition] = useState(null);
  const bouton = useRef(null);
  const liste = useRef(null);
  const auClavier = useRef(false);

  const elements = [
    ...(onView ? [{ label: 'Voir le détail', icon: Eye, onClick: onView }] : []),
    ...menu.filter(Boolean),
    ...(onDelete ? [{ label: 'Supprimer', icon: Trash2, onClick: onDelete, danger: true, disabled: deleteDisabled, title: deleteTitle }] : []),
  ];

  // Menu placé sous le bouton (ou au-dessus s'il manque de place), hors des conteneurs qui défilent
  useLayoutEffect(() => {
    if (!ouvert || !bouton.current || !liste.current) return;
    const cible = bouton.current.getBoundingClientRect();
    const menuRect = liste.current.getBoundingClientRect();
    const enDessous = cible.bottom + 4 + menuRect.height <= window.innerHeight - 8;
    setPosition({
      top: enDessous ? cible.bottom + 4 : Math.max(8, cible.top - menuRect.height - 4),
      left: Math.max(8, Math.min(cible.right - menuRect.width, window.innerWidth - menuRect.width - 8)),
    });
  }, [ouvert]);

  useEffect(() => {
    if (!ouvert) return undefined;
    const fermer = (e) => {
      if (liste.current?.contains(e.target) || bouton.current?.contains(e.target)) return;
      setOuvert(false);
    };
    // Échap ferme le menu seulement (pas la fenêtre qui le contient)
    const clavier = (e) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      setOuvert(false);
      bouton.current?.focus();
    };
    const defilement = () => setOuvert(false);
    document.addEventListener('mousedown', fermer);
    document.addEventListener('keydown', clavier, true);
    window.addEventListener('scroll', defilement, true);
    window.addEventListener('resize', defilement);
    return () => {
      document.removeEventListener('mousedown', fermer);
      document.removeEventListener('keydown', clavier, true);
      window.removeEventListener('scroll', defilement, true);
      window.removeEventListener('resize', defilement);
    };
  }, [ouvert]);

  // Ouvert au clavier : le premier choix prend le focus (à la souris, pas de cadre de focus inutile)
  useEffect(() => {
    if (ouvert && position && auClavier.current) liste.current?.querySelector('button:not([disabled])')?.focus();
  }, [ouvert, position]);

  const choisir = (element) => {
    setOuvert(false);
    setPosition(null);
    element.onClick();
  };

  return (
    <div className="flex items-center justify-end gap-0.5" onClick={(e) => e.stopPropagation()}>
      {children}
      {onEdit && (
        <button type="button" onClick={onEdit} disabled={editDisabled} className={BOUTON}
          aria-label="Modifier" title={editTitle || 'Modifier'}>
          <Pencil size={15} />
        </button>
      )}
      {elements.length > 0 && (
        <button
          ref={bouton}
          type="button"
          onClick={(e) => { auClavier.current = e.detail === 0; setPosition(null); setOuvert((o) => !o); }}
          className={`${menuButtonClassName || BOUTON} ${ouvert ? 'bg-forest-50 text-forest-700' : ''}`}
          aria-label="Plus d'actions"
          aria-haspopup="menu"
          aria-expanded={ouvert}
          title="Plus d'actions"
        >
          <MoreHorizontal size={16} />
        </button>
      )}
      {ouvert && createPortal(
        <div
          ref={liste}
          role="menu"
          onClick={(e) => e.stopPropagation()}
          style={position ? { top: position.top, left: position.left } : { top: -9999, left: -9999 }}
          className="fixed z-70 min-w-44 rounded-lg border border-ink-100 bg-white py-1 shadow-soft-lg"
        >
          {elements.map((element, i) => {
            const Icone = element.icon;
            return (
              <div key={element.label}>
                {element.danger && i > 0 && <div className="my-1 border-t border-ink-100" />}
                <button
                  type="button"
                  role="menuitem"
                  disabled={element.disabled}
                  title={element.disabled ? element.title : undefined}
                  onClick={() => choisir(element)}
                  className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                    element.danger ? 'text-earth-700 hover:bg-earth-50' : 'text-ink-700 hover:bg-cream-50'
                  }`}
                >
                  {Icone && <Icone size={15} className="shrink-0" />}
                  {element.label}
                </button>
              </div>
            );
          })}
        </div>,
        document.body,
      )}
    </div>
  );
}
