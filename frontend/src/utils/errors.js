// Affiche les erreurs renvoyées par le serveur : sous chaque champ du formulaire + un message général.
export function showServerErrors(error, { setFormErrors, toast } = {}) {
  if (setFormErrors) setFormErrors(error?.fields || {});
  const hasFieldErrors = error?.fields && Object.keys(error.fields).length > 0;
  toast?.error(hasFieldErrors && error.status === 400 ? 'Vérifiez les champs signalés.' : error?.message || 'Une erreur est survenue.');
}

export const today = () => new Date().toISOString().split('T')[0];
export const currentPeriode = () => today().substring(0, 7);
