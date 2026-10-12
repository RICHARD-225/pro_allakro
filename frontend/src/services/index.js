// Couche services : accès à l'API Django REST (données réelles en base).
// Les calculs (montants, soldes, stock, codes automatiques) et les validations sont faits par le serveur.
import api from '@/api/client';

function resource(path, { code = false } = {}) {
  return {
    getAll: (params) => api.get(`/${path}/`, params),
    // Liste paginée par le serveur (params : page, page_size, q, ordering + filtres) → { count, page, pages, results }
    page: (params) => api.get(`/${path}/`, params),
    // Indicateurs de la page sur toutes les lignes filtrées (même filtres et recherche que la liste)
    totaux: (params) => api.get(`/${path}/totaux/`, params),
    getById: (id) => api.get(`/${path}/${id}/`),
    create: (data) => api.post(`/${path}/`, data),
    update: (id, data) => api.patch(`/${path}/${id}/`, data),
    remove: (id) => api.delete(`/${path}/${id}/`),
    // Code qui sera attribué au prochain enregistrement (affichage uniquement)
    ...(code ? { nextCode: () => api.get(`/${path}/prochain-code/`).then((r) => r.code) } : {}),
  };
}

// Exploitation
export const plantationsService = resource('plantations', { code: true });
export const campementsService = resource('campements', { code: true });
export const blocsService = resource('blocs', { code: true });
// Liste d'unités réutilisable (travaux, achats) ; unité par défaut : ha
export const unitesService = { getAll: () => api.get('/unites/') };

// Personnel
export const personnesService = {
  ...resource('personnes', { code: true }),
  // Travaux, rôles, rémunérations (dont « payé via le chef d'équipe ») et paiements reçus
  historique: (id) => api.get(`/personnes/${id}/historique/`),
};
// Fonction déjà connue (majuscules et espaces ignorés) : le serveur renvoie l'existante au lieu d'en créer une autre
export const fonctionsService = resource('fonctions');

// Travaux : l'équipe, la rémunération et l'avance sont créées avec le travail
export const typesTravauxService = resource('types-travaux', { code: true });
export const activitesService = typesTravauxService;
export const travauxService = {
  ...resource('travaux'),
  getByBloc: (blocId) => api.get('/travaux/', { bloc_id: blocId }),
  annuler: (id) => api.post(`/travaux/${id}/annuler/`),
  retablir: (id) => api.post(`/travaux/${id}/retablir/`),
  creerRemuneration: (id) => api.post(`/travaux/${id}/remuneration/`),
  historique: (id) => api.get(`/travaux/${id}/historique/`),
};

// Finances
export const categoriesDepensesService = resource('categories-depenses', { code: true });
export const depensesService = resource('depenses');
// Salaires = rémunérations (générées par les travaux ou saisies) + paiements
export const salairesService = {
  ...resource('salaires'),
  annuler: (id) => api.post(`/salaires/${id}/annuler/`),
  retablir: (id) => api.post(`/salaires/${id}/retablir/`),
};
export const paiementsService = {
  ...resource('paiements-salaire'),
  // Plusieurs rémunérations payées ensemble au même bénéficiaire (tout ou rien)
  createLot: (data) => api.post('/paiements-salaire/lot/', data),
  // Reçu PDF du paiement ; renvoie le nom du fichier téléchargé
  telechargerRecu: (id) => api.download(`/paiements-salaire/${id}/recu/`),
  // Annule un paiement : il reste dans l'historique (marqué annulé), sa dépense disparaît, le reste à payer remonte
  annuler: (id, motif = '') => api.post(`/paiements-salaire/${id}/annuler/`, { motif }),
  // Remet en vigueur un paiement annulé (il compte de nouveau et sa dépense est recréée)
  reactiver: (id) => api.post(`/paiements-salaire/${id}/reactiver/`),
};
// Notifications du compte (cloche de l'en-tête)
export const notificationsService = {
  get: () => api.get('/notifications/'),
  lire: (id) => api.post(`/notifications/${id}/lire/`),
  toutLire: () => api.post('/notifications/lire-tout/'),
};
// Clôture mensuelle (Big Boss) : chiffres du mois figés, plus d'écriture sur ses données
export const cloturesService = {
  getAll: () => api.get('/clotures/'),
  cloturer: (periode, commentaire = '') => api.post('/clotures/', { periode, commentaire }),
  rouvrir: (periode) => api.post(`/clotures/${periode}/rouvrir/`),
};
export const dashboardService = {
  get: (params) => api.get('/tableau-de-bord/', params),
};
export const rapportsService = {
  // Télécharge le rapport de gestion Excel (une feuille par thème) ; renvoie le nom du fichier
  telecharger: (params) => api.download('/rapport/', params),
};

// Stock
export const produitsService = resource('produits', { code: true });
export const mouvementsService = resource('mouvements-stock');

// Achats aux particuliers
export const particuliersService = resource('particuliers');
export const achatsParticuliersService = {
  ...resource('achats-particuliers', { code: true }),
  payer: (id, data) => api.post(`/achats-particuliers/${id}/payer/`, data),
  telechargerRecu: (id) => api.download(`/achats-particuliers/${id}/recu/`),
};

// Administration
export const utilisateursService = {
  ...resource('utilisateurs'),
  // Suivi d'un compte (Big Boss) : connexions, actions par type et dernières actions du journal
  activite: (id) => api.get(`/utilisateurs/${id}/activite/`),
  // Lève le blocage de connexion d'un compte (trop d'échecs de mot de passe)
  debloquer: (id) => api.post(`/utilisateurs/${id}/debloquer/`),
};
export const rolesService = resource('roles');
export const journalService = resource('journal');
