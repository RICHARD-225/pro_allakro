import api from './client';

export const authApi = {
  login: (username, password) => api.post('/auth/login/', { username, password }),
  logout: () => api.post('/auth/logout/'),
  me: () => api.get('/auth/me/'),
  changerMotDePasse: (data) => api.post('/auth/mot-de-passe/', data),
  // Mot de passe oublié : e-mail avec un lien à usage unique, puis choix du nouveau mot de passe
  motDePasseOublie: (email) => api.post('/auth/mot-de-passe-oublie/', { email }),
  verifierLien: (token) => api.get('/auth/reinitialiser-mot-de-passe/', { token }),
  reinitialiser: (data) => api.post('/auth/reinitialiser-mot-de-passe/', data),
};
