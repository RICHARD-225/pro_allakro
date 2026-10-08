// Couche services : accès à l'API Django REST (données réelles en base).
// Les calculs (montants, soldes, stock, codes automatiques) et les validations sont faits par le serveur.
import api from '@/api/client';

function resource(path, { code = false } = {}) {
  return {
    getAll: (params) => api.get(`/${path}/`, params),
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

// Personnel
export const personnesService = resource('personnes', { code: true });
export const fonctionsService = resource('fonctions');
export const equipesService = resource('equipes', { code: true });

// Travaux
export const typesTravauxService = resource('types-travaux', { code: true });
export const travauxService = {
  ...resource('travaux'),
  getByBloc: (blocId) => api.get('/travaux/', { bloc_id: blocId }),
};

// Finances
export const categoriesDepensesService = resource('categories-depenses', { code: true });
export const depensesService = resource('depenses');
export const salairesService = resource('salaires');
export const paiementsService = {
  ...resource('paiements-salaire'),
  // Paiement de plusieurs membres d'une équipe en une seule opération (tout ou rien)
  createGroupe: (data) => api.post('/paiements-salaire/groupe/', data),
};
export const previsionsService = resource('previsions');
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
};

// Administration
export const utilisateursService = resource('utilisateurs');
export const rolesService = resource('roles');
export const journalService = resource('journal');

// Alias
export const remunerationsService = salairesService;
