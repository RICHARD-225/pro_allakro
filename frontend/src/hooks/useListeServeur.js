import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const DELAI_RECHERCHE = 300;

/**
 * Liste paginée par le serveur : page courante, recherche (avec délai de frappe), tri et filtres sont envoyés à l'API,
 * qui ne renvoie que les lignes de la page ; les indicateurs de la page (`totaux`) portent sur toutes les lignes filtrées.
 *
 *   const { lignes, totaux, serveur, chargement, recharger } = useListeServeur({
 *     charger: (params) => depensesService.page(params),      // → { count, page, pages, results }
 *     totaux: (params) => depensesService.totaux(params),      // facultatif → { somme, … }
 *     filtres: { categorie_id, statut, ...plage },             // paramètres de l'API (les valeurs vides sont ignorées)
 *     actif: true,                                             // false : n'interroge pas le serveur (ex. période invalide)
 *   });
 *   <DataTable data={lignes} serveur={serveur} loading={chargement} … />
 */
export function useListeServeur({ charger, totaux: chargerTotaux, filtres = {}, actif = true, tailleDefaut = 10, triInitial = null }) {
  const [pageEtat, setPageEtat] = useState({ cle: '', page: 1 });
  const [taille, setTaille] = useState(tailleDefaut);
  const [recherche, setRecherche] = useState('');
  const [rechercheEnvoyee, setRechercheEnvoyee] = useState('');
  const [tri, setTri] = useState(triInitial); // { cle, sens: 'asc' | 'desc' }
  const [resultat, setResultat] = useState({ count: 0, pages: 1, results: [] });
  const [totaux, setTotaux] = useState(null);
  const [chargement, setChargement] = useState(true);   // premier chargement
  const [actualisation, setActualisation] = useState(false); // chargement d'une autre page, d'un filtre…
  const [erreur, setErreur] = useState(null);
  const [version, setVersion] = useState(0);
  const jeton = useRef(0);

  const cleFiltres = JSON.stringify(Object.fromEntries(Object.entries(filtres).filter(([, v]) => v !== '' && v != null && v !== false)));

  // La recherche part au serveur 300 ms après la dernière frappe
  useEffect(() => {
    const minuteur = window.setTimeout(() => setRechercheEnvoyee(recherche.trim()), DELAI_RECHERCHE);
    return () => window.clearTimeout(minuteur);
  }, [recherche]);

  // Tout changement de filtre, de recherche, de tri ou de taille ramène à la première page (sans requête inutile)
  const cleReset = `${cleFiltres}|${rechercheEnvoyee}|${tri?.cle}|${tri?.sens}|${taille}`;
  const page = pageEtat.cle === cleReset ? pageEtat.page : 1;
  const setPage = useCallback((p) => setPageEtat({ cle: cleReset, page: p }), [cleReset]);

  const requeteBase = useMemo(() => ({
    ...JSON.parse(cleFiltres),
    ...(rechercheEnvoyee ? { q: rechercheEnvoyee } : {}),
  }), [cleFiltres, rechercheEnvoyee]);

  useEffect(() => {
    if (!actif) return undefined;
    const numero = ++jeton.current;
    setActualisation(true);
    const params = { ...requeteBase, ...(tri ? { ordering: `${tri.sens === 'desc' ? '-' : ''}${tri.cle}` } : {}), page, page_size: taille };
    const demandes = [charger(params), chargerTotaux ? chargerTotaux(requeteBase) : Promise.resolve(null)];
    Promise.all(demandes)
      .then(([liste, t]) => {
        if (numero !== jeton.current) return; // réponse périmée (une requête plus récente est partie)
        setResultat(liste);
        setTotaux(t);
        setErreur(null);
        if (liste.page !== page) setPageEtat({ cle: cleReset, page: liste.page });
      })
      .catch((e) => { if (numero === jeton.current) setErreur(e); })
      .finally(() => { if (numero === jeton.current) { setChargement(false); setActualisation(false); } });
    return () => { /* la réponse périmée est ignorée via `jeton` */ };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requeteBase, tri?.cle, tri?.sens, page, taille, actif, version, cleReset]);

  const recharger = useCallback(() => setVersion((v) => v + 1), []);

  const basculerTri = useCallback((cle) => {
    setTri((courant) => (courant?.cle === cle ? { cle, sens: courant.sens === 'asc' ? 'desc' : 'asc' } : { cle, sens: 'asc' }));
  }, []);

  const serveur = {
    total: resultat.count,
    page,
    pages: resultat.pages,
    pageSize: taille,
    recherche,
    tri,
    actualisation,
    onRecherche: setRecherche,
    onTri: (cle, sens) => (sens ? setTri(cle ? { cle, sens } : null) : basculerTri(cle)),
    onPage: setPage,
    onPageSize: setTaille,
  };

  return { lignes: resultat.results, total: resultat.count, totaux, serveur, chargement, actualisation, erreur, recharger };
}
