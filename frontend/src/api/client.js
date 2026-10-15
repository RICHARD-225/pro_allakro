// Client HTTP centralisé pour l'API Django REST.
// - Les jetons JWT sont dans des cookies httpOnly, gérés par le navigateur (credentials: 'include').
// - Un 401 déclenche un rafraîchissement automatique de la session puis rejoue la requête une fois.
// - Les erreurs de validation du serveur sont exposées champ par champ (ApiError.fields).
import { demarrerChargement } from '@/utils/chargement';

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api/v1';

// Requêtes qui ne doivent pas déclencher de rafraîchissement de session
const SANS_RAFRAICHISSEMENT = ['/auth/login/', '/auth/refresh/', '/auth/logout/'];

let onUnauthorized = null;
export function setUnauthorizedHandler(handler) {
  onUnauthorized = handler;
}

const firstMessage = (value) => {
  if (Array.isArray(value)) return firstMessage(value[0]);
  if (value && typeof value === 'object') return firstMessage(Object.values(value)[0]);
  return value == null ? '' : String(value);
};

// { champ: ['msg'] } -> { champ: 'msg' } ; les listes d'objets (ex. lignes) restent des listes
function fieldErrors(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return {};
  const out = {};
  Object.entries(data).forEach(([key, value]) => {
    if (key === 'detail' || key === 'non_field_errors') return;
    out[key] = Array.isArray(value) && value.some((v) => v && typeof v === 'object')
      ? value.map((v) => fieldErrors(v))
      : firstMessage(value);
  });
  return out;
}

function messageOf(data, status) {
  if (data?.detail) return firstMessage(data.detail);
  if (data?.non_field_errors) return firstMessage(data.non_field_errors);
  if (status === 400) return 'Certaines informations sont invalides : vérifiez le formulaire.';
  if (status === 401) return 'Votre session a expiré, reconnectez-vous.';
  if (status === 403) return "Vous n'avez pas les droits pour cette action.";
  if (status === 404) return 'Élément introuvable.';
  if (status >= 500) return 'Erreur du serveur. Réessayez plus tard.';
  return `Erreur ${status}`;
}

export class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
    this.fields = fieldErrors(data);
  }
}

// Les identifiants sont manipulés en chaînes côté interface (valeurs des listes déroulantes)
const isIdKey = (key) => key === 'id' || key.endsWith('_id') || key.endsWith('_ids');
function normalize(value, key = '') {
  if (Array.isArray(value)) return value.map((v) => normalize(v, key));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, normalize(v, k)]));
  }
  if (typeof value === 'number' && isIdKey(key)) return String(value);
  return value;
}

function buildUrl(path, params) {
  const query = new URLSearchParams();
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') query.append(key, value);
  });
  const qs = query.toString();
  return `${API_BASE_URL}${path}${qs ? `?${qs}` : ''}`;
}

// --- Protection CSRF : le serveur pose le cookie « csrftoken » (GET /auth/csrf/) ; chaque requête qui modifie des données
// le renvoie dans l'en-tête X-CSRFToken. Un site tiers ne peut ni lire ce cookie ni forger l'en-tête.
const lireCookie = (nom) => {
  const trouve = document.cookie.split('; ').find((c) => c.startsWith(`${nom}=`));
  return trouve ? decodeURIComponent(trouve.slice(nom.length + 1)) : '';
};
let csrfEnCours = null;
async function assurerCsrf(forcer = false) {
  if (!forcer && lireCookie('csrftoken')) return;
  if (!csrfEnCours) {
    csrfEnCours = fetch(`${API_BASE_URL}/auth/csrf/`, { credentials: 'include' })
      .catch(() => null)
      .finally(() => { csrfEnCours = null; });
  }
  await csrfEnCours;
}
const enTetesCsrf = () => ({ 'X-CSRFToken': lireCookie('csrftoken') });

let refreshing = null;
function refreshSession() {
  if (!refreshing) {
    refreshing = assurerCsrf()
      .then(() => fetch(`${API_BASE_URL}/auth/refresh/`, { method: 'POST', credentials: 'include', headers: enTetesCsrf() }))
      .then((response) => response.ok)
      .catch(() => false)
      .finally(() => { setTimeout(() => { refreshing = null; }, 0); });
  }
  return refreshing;
}

async function request(path, { method = 'GET', body, params, retry = true, csrfRetry = true } = {}) {
  let response;
  const modifie = method !== 'GET';
  try {
    if (modifie) await assurerCsrf();
    response = await fetch(buildUrl(path, params), {
      method,
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(modifie ? enTetesCsrf() : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError('Impossible de joindre le serveur. Vérifiez votre connexion.', 0, null);
  }

  // Jeton CSRF absent ou périmé : on en demande un nouveau et on rejoue la requête une fois
  if (response.status === 403 && modifie && csrfRetry) {
    const donnees = await response.clone().json().catch(() => null);
    if (donnees?.code === 'csrf') {
      await assurerCsrf(true);
      return request(path, { method, body, params, retry, csrfRetry: false });
    }
  }

  if (response.status === 401 && retry && !SANS_RAFRAICHISSEMENT.includes(path)) {
    if (await refreshSession()) return request(path, { method, body, params, retry: false });
    onUnauthorized?.();
  }

  const data = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) throw new ApiError(messageOf(data, response.status), response.status, data);
  return normalize(data);
}

// Téléchargement d'un fichier généré par le serveur (rapport Excel)
async function download(path, params, retry = true) {
  let response;
  try {
    response = await fetch(buildUrl(path, params), { credentials: 'include', headers: { Accept: '*/*' } });
  } catch {
    throw new ApiError('Impossible de joindre le serveur. Vérifiez votre connexion.', 0, null);
  }
  if (response.status === 401 && retry) {
    if (await refreshSession()) return download(path, params, false);
    onUnauthorized?.();
  }
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new ApiError(messageOf(data, response.status), response.status, data);
  }
  const disposition = response.headers.get('Content-Disposition') || '';
  const filename = /filename="([^"]+)"/.exec(disposition)?.[1] || 'rapport.xlsx';
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return filename;
}

// Chaque appel est suivi : la barre de progression du haut de l'écran apparaît s'il dure plus de 250 ms
const suivi = (promesse) => {
  const fin = demarrerChargement();
  return promesse.finally(fin);
};

export const api = {
  get: (path, params) => suivi(request(path, { params })),
  post: (path, data) => suivi(request(path, { method: 'POST', body: data ?? {} })),
  patch: (path, data) => suivi(request(path, { method: 'PATCH', body: data })),
  delete: (path) => suivi(request(path, { method: 'DELETE' })),
  download: (path, params) => suivi(download(path, params)),
};

export default api;
