import { Tags } from 'lucide-react';
import ReferentielPage from '@/components/ReferentielPage';
import { categoriesDepensesService } from '@/services';

export default function CategoriesDepensesPage() {
  return (
    <ReferentielPage
      title="Catégories de dépenses"
      subtitle="Classement comptable des dépenses"
      icon={Tags}
      service={categoriesDepensesService}
      itemLabel="Catégorie"
      placeholder="Ex: Transport"
    />
  );
}
