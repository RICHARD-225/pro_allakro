import { useMemo } from 'react';
import Select from './Select';
import { today } from '@/utils/errors';
import { formatDate } from '@/utils/format';

/**
 * Filtre de période pour les listes : période en cours, mois précédent, période personnalisée (début et fin),
 * ou toutes les périodes. La plage est envoyée à l'API (`date_debut` / `date_fin`), qui filtre sur la date de
 * l'opération (date de la dépense, du paiement, de début de la rémunération…), jamais sur la date de saisie.
 *
 * value : { mode: '' | 'courante' | 'precedente' | 'perso', debut: 'AAAA-MM-JJ', fin: 'AAAA-MM-JJ' }
 */
export const PERIODE_VIDE = { mode: '', debut: '', fin: '' };

const pad = (n) => String(n).padStart(2, '0');
const jourDuMois = (annee, mois) => `${annee}-${pad(mois)}-01`;
const dernierJour = (annee, mois) => `${annee}-${pad(mois)}-${pad(new Date(annee, mois, 0).getDate())}`;

// Mois en cours / précédent : [début, fin, « AAAA-MM »]
function mois(decalage) {
  const [annee, moisCourant] = today().split('-').map(Number);
  const index = annee * 12 + moisCourant - 1 + decalage;
  const a = Math.floor(index / 12);
  const m = (index % 12) + 1;
  return [jourDuMois(a, m), dernierJour(a, m), `${a}-${pad(m)}`];
}

/** Erreur de saisie d'une période personnalisée (null si valide). */
export function erreurPeriode(valeur) {
  if (valeur.mode === 'perso' && valeur.debut && valeur.fin && valeur.fin < valeur.debut) {
    return 'La date de fin doit être postérieure ou égale à la date de début.';
  }
  return null;
}

/** Paramètres d'API (`date_debut`, `date_fin`) d'un filtre ; {} sans période ou si la saisie est invalide. */
export function plagePeriode(valeur) {
  if (!valeur || erreurPeriode(valeur)) return {};
  if (valeur.mode === 'courante') { const [debut, fin] = mois(0); return { date_debut: debut, date_fin: fin }; }
  if (valeur.mode === 'precedente') { const [debut, fin] = mois(-1); return { date_debut: debut, date_fin: fin }; }
  if (valeur.mode === 'perso') {
    return { ...(valeur.debut ? { date_debut: valeur.debut } : {}), ...(valeur.fin ? { date_fin: valeur.fin } : {}) };
  }
  return {};
}

/** Un filtre de période est actif dès qu'une période est choisie (même personnalisée et encore incomplète : « Réinitialiser » reste proposé). */
export const periodeActive = (valeur) => Boolean(valeur?.mode);

/** Phrase décrivant la plage, pour les sous-titres (« du 01/10/2026 au 31/10/2026 »). */
export function libellePlage(valeur) {
  const { date_debut: debut, date_fin: fin } = plagePeriode(valeur);
  if (!debut && !fin) return '';
  if (debut && fin) return `du ${formatDate(debut)} au ${formatDate(fin)}`;
  return debut ? `à partir du ${formatDate(debut)}` : `jusqu'au ${formatDate(fin)}`;
}

const CHAMP = 'min-w-0 rounded-lg border border-ink-200 bg-white px-2.5 py-2 text-base text-ink-800 transition-colors focus:border-forest-400 focus:outline-hidden focus:ring-2 focus:ring-forest-100 sm:text-sm';

export default function FiltrePeriode({ value, onChange, className = '' }) {
  // Les dates exactes de la période choisie sont rappelées sous les indicateurs de la page
  const options = useMemo(() => [
    { value: 'courante', label: 'Période en cours' },
    { value: 'precedente', label: 'Mois précédent' },
    { value: 'perso', label: 'Période personnalisée' },
  ], []);
  const erreur = erreurPeriode(value);
  const perso = value.mode === 'perso';

  return (
    <div className={`flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center ${className}`}>
      <Select
        value={value.mode}
        onChange={(e) => onChange({ ...PERIODE_VIDE, mode: e.target.value })}
        options={options}
        placeholder="Période" emptyLabel="Toutes les périodes"
        className="w-full sm:w-52"
      />
      {perso && (
        <div className="flex items-center gap-2">
          <input type="date" aria-label="Date de début" value={value.debut} max={value.fin || undefined}
            onChange={(e) => onChange({ ...value, debut: e.target.value })} className={`${CHAMP} flex-1 sm:w-36 sm:flex-none`} />
          <span className="text-xs text-ink-500" aria-hidden="true">au</span>
          <input type="date" aria-label="Date de fin" value={value.fin} min={value.debut || undefined}
            onChange={(e) => onChange({ ...value, fin: e.target.value })} className={`${CHAMP} flex-1 sm:w-36 sm:flex-none`} />
        </div>
      )}
      {erreur && <p role="alert" className="text-xs text-earth-700 sm:basis-full">{erreur}</p>}
    </div>
  );
}
