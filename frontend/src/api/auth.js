import api from './client';

export const authApi = {
  login: (username, password) => api.post('/auth/login/', { username, password }),
  logout: () => api.post('/auth/logout/'),
  me: () => api.get('/auth/me/'),
  changerMotDePasse: (data) => api.post('/auth/mot-de-passe/', data),
};
