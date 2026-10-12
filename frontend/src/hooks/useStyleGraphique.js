import { useTheme } from '@/contexts/ThemeContext';
import { CHART_COLORS } from '@/constants';

const COULEURS_SOMBRES = ['#a6d6af', '#80bd8a', '#d5ca75', '#83b49a', '#d69d74'];

/**
 * Couleurs des graphiques selon le thème : libellés d'axes lisibles (11 px, gris ink-500 en clair),
 * grille, survol, info-bulle, couleurs des séries « prévu » / « réalisé » et des catégories (anneaux).
 */
export function useStyleGraphique() {
  const { theme } = useTheme();
  const sombre = theme === 'dark';
  const grille = sombre ? '#34443a' : '#e7e9e7';
  return {
    sombre,
    axe: { fontSize: 11, fill: sombre ? '#bdcbbf' : '#636a63' },
    grille,
    ligne: sombre ? '#a6d6af' : '#2f6142',
    prevu: sombre ? '#6b7a70' : '#aab4ae',
    categories: sombre ? COULEURS_SOMBRES : CHART_COLORS,
    survol: sombre ? 'rgba(255,255,255,0.06)' : 'rgba(244,240,230,0.5)',
    infoBulle: {
      backgroundColor: sombre ? '#233128' : 'white',
      border: `1px solid ${grille}`,
      borderRadius: '8px',
      color: sombre ? '#e5eee7' : '#3c403c',
      fontSize: '12px',
      boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
    },
  };
}
