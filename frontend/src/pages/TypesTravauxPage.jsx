import { PenTool } from 'lucide-react';
import ReferentielPage from '@/components/ReferentielPage';
import { typesTravauxService } from '@/services';

const UNITES = [
  { value: 'ha', label: 'Hectares (ha)' },
  { value: 'pied', label: 'Pieds' },
  { value: 'jour', label: 'Jours' },
  { value: 'L', label: 'Litres (L)' },
  { value: 'kg', label: 'Kilogrammes (kg)' },
];

export default function TypesTravauxPage() {
  return (
    <ReferentielPage
      title="Types de travaux"
      subtitle="Nature des travaux réalisés sur les blocs"
      icon={PenTool}
      service={typesTravauxService}
      itemLabel="Type de travail"
      placeholder="Ex: Élagage"
      fields={[{ key: 'unite_par_defaut', label: 'Unité par défaut', options: UNITES, default: 'ha' }]}
    />
  );
}
