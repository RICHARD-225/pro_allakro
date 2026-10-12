// Formatting utilities

export function formatFCFA(value) {
  if (value == null || isNaN(value)) return '0 FCFA';
  return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(value) + ' FCFA';
}

export function formatNumber(value) {
  if (value == null || isNaN(value)) return '0';
  return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(value);
}

export function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function formatDateTime(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }) + ' ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

export function formatPeriode(periode) {
  if (!periode) return '—';
  const [y, m] = periode.split('-').map(Number);
  const months = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
  return `${months[m - 1]} ${y}`;
}

// --- Montant en lettres (reçus) : « Douze mille cinq cents francs CFA » ---
const UNITES = ['zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix', 'onze', 'douze', 'treize',
  'quatorze', 'quinze', 'seize', 'dix-sept', 'dix-huit', 'dix-neuf'];
const DIZAINES = ['', '', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante'];

// 0 à 99 ; « quatre-vingts » prend son s seulement s'il termine le nombre
function moinsDeCent(n, final) {
  if (n < 20) return UNITES[n];
  const d = Math.floor(n / 10);
  const u = n % 10;
  if (d < 7) {
    if (u === 0) return DIZAINES[d];
    return u === 1 ? `${DIZAINES[d]} et un` : `${DIZAINES[d]}-${UNITES[u]}`;
  }
  if (d === 7) return u === 1 ? 'soixante et onze' : `soixante-${UNITES[10 + u]}`;
  if (d === 8) return u === 0 ? (final ? 'quatre-vingts' : 'quatre-vingt') : `quatre-vingt-${UNITES[u]}`;
  return `quatre-vingt-${UNITES[10 + u]}`;
}

// 0 à 999 ; « cents » prend son s seulement s'il termine le nombre
function moinsDeMille(n, final) {
  const c = Math.floor(n / 100);
  const r = n % 100;
  let texte = '';
  if (c > 0) {
    texte = c === 1 ? 'cent' : `${UNITES[c]} cent`;
    if (r === 0 && c > 1 && final) texte += 's';
  }
  if (r > 0) texte += (texte ? ' ' : '') + moinsDeCent(r, final);
  return texte;
}

export function nombreEnLettres(valeur) {
  let reste = Math.floor(Math.abs(Number(valeur) || 0));
  if (reste === 0) return 'zéro';
  const morceaux = [];
  for (const [seuil, nom] of [[1e9, 'milliard'], [1e6, 'million']]) {
    const q = Math.floor(reste / seuil);
    if (q > 0) {
      morceaux.push(`${moinsDeMille(q, false)} ${nom}${q > 1 ? 's' : ''}`);
      reste %= seuil;
    }
  }
  const milliers = Math.floor(reste / 1000);
  reste %= 1000;
  if (milliers > 0) morceaux.push(milliers === 1 ? 'mille' : `${moinsDeMille(milliers, false)} mille`);
  if (reste > 0) morceaux.push(moinsDeMille(reste, true));
  return morceaux.join(' ');
}

export function montantEnLettres(valeur) {
  const texte = nombreEnLettres(valeur);
  const entier = Math.floor(Math.abs(Number(valeur) || 0));
  const franc = entier > 1 ? 'francs' : 'franc';
  const de = entier >= 1e6 && entier % 1e6 === 0 ? 'de ' : ''; // « un million de francs »
  return `${texte.charAt(0).toUpperCase()}${texte.slice(1)} ${de}${franc} CFA`;
}
