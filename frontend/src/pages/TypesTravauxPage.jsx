import { useEffect, useState } from 'react';
import { ListChecks } from 'lucide-react';
import ReferentielPage from '@/components/ReferentielPage';
import { activitesService, unitesService } from '@/services';

export default function TypesTravauxPage() {
  const [unites, setUnites] = useState({ defaut: 'ha', unites: [] });

  useEffect(() => {
    unitesService.getAll().then(setUnites).catch(() => undefined);
  }, []);

  return (
    <ReferentielPage
      title="Activités"
      subtitle="Activités proposées pour les travaux (OUVERTURES, PLANTING, … AUTRE)"
      icon={ListChecks}
      service={activitesService}
      itemLabel="Activité"
      placeholder="Ex: ÉLAGAGE"
      libelleHint="Enregistrée en majuscules ; une activité existante n'est jamais dupliquée."
      fields={[
        {
          key: 'unite_par_defaut', label: 'Unité par défaut', default: unites.defaut,
          options: unites.unites.map((u) => ({ value: u.code, label: u.libelle })),
        },
        { key: 'ordre', label: "Ordre d'affichage", type: 'number', default: 100 },
        {
          key: 'precision_requise', label: "Nom à préciser sur le travail", type: 'boolean', default: false,
          hint: "Comme « AUTRE » : le nom réel de l'activité est saisi à la création du travail.",
        },
      ]}
    />
  );
}
