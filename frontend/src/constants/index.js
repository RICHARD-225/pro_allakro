// Central design tokens and app constants

export const APP_NAME = 'ALLAKRO';
export const APP_TAGLINE = 'Gestion des plantations';

export const COLORS = {
  primary: 'forest',
  secondary: 'leaf',
  accent: 'olive',
  neutral: 'ink',
  surface: 'cream',
  warning: 'earth',
};

// Status colors for badges
export const STATUS_STYLES = {
  active: 'bg-leaf-100 text-leaf-700',
  inactive: 'bg-ink-100 text-ink-500',
  pending: 'bg-olive-100 text-olive-700',
  paid: 'bg-leaf-100 text-leaf-700',
  partial: 'bg-olive-100 text-olive-700',
  unpaid: 'bg-earth-100 text-earth-700',
  low: 'bg-earth-100 text-earth-700',
  ok: 'bg-leaf-100 text-leaf-700',
  draft: 'bg-ink-100 text-ink-500',
  done: 'bg-forest-100 text-forest-700',
  in_progress: 'bg-olive-100 text-olive-700',
  planned: 'bg-sage-100 text-sage-700',
  
  PLANIFIE: 'bg-sage-100 text-sage-700',
  EN_COURS: 'bg-olive-100 text-olive-700',
  TERMINE: 'bg-forest-100 text-forest-700',
  ANNULE: 'bg-ink-100 text-ink-500',
  ANNULEE: 'bg-ink-100 text-ink-500',
  NON_PAYEE: 'bg-earth-100 text-earth-700',
  PARTIELLE: 'bg-olive-100 text-olive-700',
  PAYEE: 'bg-leaf-100 text-leaf-700',
  AVANCE: 'bg-olive-100 text-olive-700',
};

export const ROLE = {
  BIG_BOSS: 'big_boss',
  SUPERVISOR: 'superviseur',
};

export const ROLE_LABELS = {
  big_boss: 'Big Boss',
  superviseur: 'Superviseur',
};

// Chart color palette (cohesive nature tones)
export const CHART_COLORS = [
  '#2f6142', // forest-600
  '#519744', // leaf-500
  '#97902f', // olive-500
  '#5e8767', // sage-500
  '#ad6e47', // earth-500
  '#73b063', // leaf-400
  '#c8c45e', // olive-300
  '#7fa385', // sage-400
];

// Catégorie de dépense alimentée automatiquement par les achats aux particuliers (créée par le serveur)
export const CATEGORIE_ACHAT_PARTICULIERS = 'Achat de produits particuliers';

// Statuts des travaux (alignés backend)
export const STATUT_TRAVAIL = {
  PLANIFIE: 'PLANIFIE',
  EN_COURS: 'EN_COURS',
  TERMINE: 'TERMINE',
  ANNULE: 'ANNULE',
};
export const STATUT_TRAVAIL_LABELS = {
  PLANIFIE: 'À venir',
  EN_COURS: 'En cours',
  TERMINE: 'Terminé',
  ANNULE: 'Annulé',
};

// Statuts des dépenses (alignés backend) : une dépense est « Payée », ou « Avance » tant que la rémunération
// (ou l'achat) qu'elle règle n'est pas soldé(e). Une dépense saisie à la main est toujours « Payée ».
export const STATUT_DEPENSE = {
  AVANCE: 'AVANCE',
  PAYEE: 'PAYEE',
};
export const STATUT_DEPENSE_LABELS = {
  AVANCE: 'Avance',
  PAYEE: 'Payée',
};

// Règlement d'un achat aux particuliers (distinct du statut de sa dépense)
export const STATUT_ACHAT_LABELS = {
  NON_PAYEE: 'Non payé',
  PARTIELLE: 'Partiellement payé',
  PAYEE: 'Payé',
};

// Statuts des rémunérations (section Salaires)
export const STATUT_SALAIRE_LABELS = {
  NON_PAYEE: 'À payer',
  PARTIELLE: 'Partiellement payé',
  PAYEE: 'Payé',
  ANNULEE: 'Annulé',
};

// Rôles dans l'équipe d'un travail
export const ROLE_TRAVAIL_LABELS = {
  CHEF: "Chef d'équipe",
  MEMBRE: 'Membre',
  RESPONSABLE: 'Responsable',
};

// Types de paiement (alignés backend)
export const TYPE_PAIEMENT = {
  ESPECES: 'ESPECES',
  MOBILE_MONEY: 'MOBILE_MONEY',
  VIREMENT: 'VIREMENT',
  AUTRE: 'AUTRE',
};
export const TYPE_PAIEMENT_LABELS = {
  ESPECES: 'Espèces',
  MOBILE_MONEY: 'Mobile Money',
  VIREMENT: 'Virement',
  AUTRE: 'Autre',
};

// Months
export const MONTHS = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
];

export const MONTHS_SHORT = [
  'Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun',
  'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc',
];

// Pagination
export const DEFAULT_PAGE_SIZE = 10;
export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

