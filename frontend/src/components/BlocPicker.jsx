import Select from '@/components/ui/Select';

/**
 * Choix en cascade Campement → Bloc.
 * - mode "form" : champs libellés, utilisés dans les formulaires d'enregistrement
 * - mode "filter" : champs compacts « Tous les campements / Tous les blocs » pour filtrer une liste
 * value: { campement_id, bloc_id } — onChange({ campement_id, bloc_id })
 */
export default function BlocPicker({ campements = [], blocs = [], value, onChange, mode = 'form', required = false, errors = {} }) {
  const isFilter = mode === 'filter';
  const campementId = value?.campement_id || '';
  const blocId = value?.bloc_id || '';

  // En saisie, seuls les campements et blocs actifs sont proposés (tous restent filtrables)
  const campementsProposes = isFilter ? campements : campements.filter((c) => c.actif !== false);
  const blocsProposes = isFilter ? blocs : blocs.filter((b) => b.actif !== false);
  const blocsDuCampement = campementId ? blocsProposes.filter((b) => b.campement_id === campementId) : blocsProposes;

  const setCampement = (id) => {
    const bloc = blocs.find((b) => b.id === blocId);
    onChange({ campement_id: id, bloc_id: bloc && bloc.campement_id === id ? blocId : '' });
  };

  // Choisir un bloc renseigne aussi son campement
  const setBloc = (id) => {
    const bloc = blocs.find((b) => b.id === id);
    onChange({ campement_id: bloc ? bloc.campement_id : campementId, bloc_id: id });
  };

  return (
    <div className={isFilter ? 'contents' : 'grid grid-cols-1 sm:grid-cols-2 gap-3'}>
      <Select
        label={isFilter ? undefined : 'Campement'}
        required={required}
        options={campementsProposes.map((c) => ({ value: c.id, label: c.nom }))}
        placeholder={isFilter ? 'Campement' : 'Choisir un campement'}
        emptyLabel={isFilter ? 'Tous les campements' : undefined}
        value={campementId}
        onChange={(e) => setCampement(e.target.value)}
        error={errors.campement_id}
        className={isFilter ? 'w-full sm:w-40' : ''}
      />
      <Select
        label={isFilter ? undefined : 'Bloc'}
        required={required}
        options={blocsDuCampement.map((b) => ({ value: b.id, label: `${b.code} — ${b.nom}` }))}
        placeholder={isFilter ? 'Bloc' : 'Choisir un bloc'}
        emptyLabel={isFilter ? 'Tous les blocs' : undefined}
        value={blocId}
        onChange={(e) => setBloc(e.target.value)}
        error={errors.bloc_id}
        className={isFilter ? 'w-full sm:w-40' : ''}
      />
    </div>
  );
}

// Filtre une ligne selon { campement_id, bloc_id } (getBlocId permet de déduire le bloc d'une ligne)
export function matchBlocFilter(row, filter, getBlocId = (r) => r.bloc_id) {
  if (filter.bloc_id) return getBlocId(row) === filter.bloc_id;
  if (filter.campement_id) {
    return row.campement_id === filter.campement_id || filter.blocsDuCampement?.has(getBlocId(row));
  }
  return true;
}

// Construit le filtre utilisé par matchBlocFilter
export function buildBlocFilter(value, blocs) {
  return {
    ...value,
    blocsDuCampement: value.campement_id ? new Set(blocs.filter((b) => b.campement_id === value.campement_id).map((b) => b.id)) : null,
  };
}
