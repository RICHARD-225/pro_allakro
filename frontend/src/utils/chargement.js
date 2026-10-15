// Suivi des opérations en cours (requêtes à l'API, chargement d'une page) : alimente la barre de progression du haut de l'écran.
let compteur = 0;
const abonnes = new Set();
const prevenir = () => abonnes.forEach((f) => f());

/** Signale le début d'une opération ; renvoie la fonction à appeler à sa fin (une seule fois). */
export function demarrerChargement() {
  compteur += 1;
  prevenir();
  let termine = false;
  return () => {
    if (termine) return;
    termine = true;
    compteur = Math.max(0, compteur - 1);
    prevenir();
  };
}

export const abonnerChargement = (f) => { abonnes.add(f); return () => abonnes.delete(f); };
export const operationsEnCours = () => compteur;
