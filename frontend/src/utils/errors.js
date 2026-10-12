// Affiche les erreurs renvoyées par le serveur : sous chaque champ du formulaire + un message général.
export function showServerErrors(error, { setFormErrors, toast } = {}) {
  if (setFormErrors) setFormErrors(error?.fields || {});
  const hasFieldErrors = error?.fields && Object.keys(error.fields).length > 0;
  toast?.error(hasFieldErrors && error.status === 400 ? 'Vérifiez les champs signalés.' : error?.message || 'Une erreur est survenue.');
}

// Date du jour locale (AAAA-MM-JJ), et non celle du fuseau UTC
export const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
export const currentPeriode = () => today().substring(0, 7);
