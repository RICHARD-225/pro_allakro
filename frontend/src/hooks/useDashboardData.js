// Indicateurs du tableau de bord et du bilan, calculés par le serveur (GET /tableau-de-bord/)
import { useEffect, useState } from 'react';
import { dashboardService } from '@/services';

const EMPTY = {
  periode: '',
  periodes: [],
  kpis: {
    totalDepenses: 0, depensesEvolution: 0, depensesPayees: 0, depensesAvances: 0, remunerationDuee: 0,
    remunerationPayee: 0, resteAPayer: 0, tauxPaiement: 0, nbTravaux: 0, montantTravaux: 0, quantiteTotale: 0,
    stockDisponible: 0, valeurStock: 0, achatsParticuliers: 0, nbAchats: 0, blocsActifs: 0,
  },
  depensesParCategorie: [],
  depensesParCampement: [],
  depensesParBloc: [],
  depensesParActivite: [],
  depensesEvolutionData: [],
  remunerationData: [],
  travauxData: [],
  stockAlerts: [],
};

export function useDashboardData({ periode, campement_id, bloc_id } = {}) {
  const [data, setData] = useState(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    dashboardService.get({ periode, campement_id, bloc_id })
      .then((result) => { if (active) { setData(result); setError(null); } })
      .catch((err) => { if (active) setError(err); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [periode, campement_id, bloc_id]);

  return { data, loading, error };
}
