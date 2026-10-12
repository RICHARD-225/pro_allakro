from decimal import Decimal

from django.db import transaction
from django.db.models import Sum
from django.utils import timezone
from rest_framework import serializers

from . import services
from . import validators as v
from .models import Bloc, Campement, Equipe, Fonction, Personne, Plantation
from .utils import normaliser_espaces, normaliser_libelle


def somme_superficies(queryset, exclude=None):
    if exclude is not None:
        queryset = queryset.exclude(pk=exclude.pk)
    return queryset.aggregate(total=Sum('superficie'))['total'] or Decimal('0')


class PlantationSerializer(serializers.ModelSerializer):
    nb_campements = serializers.IntegerField(read_only=True, default=0)
    created_at = serializers.DateTimeField(source='date_creation', read_only=True)

    class Meta:
        model = Plantation
        fields = ['id', 'code', 'nom', 'localisation', 'superficie', 'unite_superficie', 'description',
                  'actif', 'nb_campements', 'created_at']
        read_only_fields = ['code']

    def validate_nom(self, value):
        value = v.texte_obligatoire(value, 'Le nom')
        return v.unique_insensible(Plantation.objects, 'nom', value, self.instance, 'Une plantation porte déjà ce nom.')

    def validate_superficie(self, value):
        v.positif_ou_nul(value, 'La superficie')
        if self.instance and value > 0:
            occupee = somme_superficies(self.instance.campements.all())
            if value < occupee:
                raise serializers.ValidationError(
                    f"Inférieure à la superficie totale de ses campements ({occupee} ha).")
        return value


class CampementSerializer(serializers.ModelSerializer):
    plantation_id = v.RelatedField(source='plantation', queryset=Plantation.objects.all())
    plantation_nom = serializers.CharField(source='plantation.nom', read_only=True)
    responsable_id = v.RelatedField(source='responsable', queryset=Personne.objects.all(), allow_null=True, required=False)
    responsable_nom = serializers.SerializerMethodField()
    nb_blocs = serializers.IntegerField(read_only=True, default=0)
    created_at = serializers.DateTimeField(source='date_creation', read_only=True)

    class Meta:
        model = Campement
        fields = ['id', 'code', 'nom', 'plantation_id', 'plantation_nom', 'responsable_id', 'responsable_nom',
                  'localisation', 'superficie', 'description', 'actif', 'nb_blocs', 'created_at']
        read_only_fields = ['code']

    def get_responsable_nom(self, obj):
        return obj.responsable.nom_complet if obj.responsable else None

    def validate_nom(self, value):
        return v.texte_obligatoire(value, 'Le nom')

    def validate_superficie(self, value):
        return v.positif_ou_nul(value, 'La superficie')

    def validate(self, attrs):
        plantation = attrs.get('plantation', getattr(self.instance, 'plantation', None))
        nom = attrs.get('nom', getattr(self.instance, 'nom', ''))
        superficie = attrs.get('superficie', getattr(self.instance, 'superficie', Decimal('0')))

        if 'plantation' in attrs and (self.instance is None or self.instance.plantation_id != plantation.pk):
            v.actif(plantation, 'Cette plantation')
        if attrs.get('responsable'):
            v.actif(attrs['responsable'], 'Le responsable choisi')
        try:
            v.unique_insensible(plantation.campements, 'nom', nom, self.instance,
                                'Un campement de cette plantation porte déjà ce nom.')
        except serializers.ValidationError as exc:
            raise serializers.ValidationError({'nom': exc.detail})

        # La somme des superficies des campements ne peut pas dépasser celle de la plantation
        if plantation.superficie > 0 and superficie > 0:
            autres = somme_superficies(plantation.campements.all(), exclude=self.instance)
            if autres + superficie > plantation.superficie:
                disponible = max(plantation.superficie - autres, Decimal('0'))
                raise serializers.ValidationError({'superficie': (
                    f"Dépasse la superficie de la plantation « {plantation.nom} » "
                    f"({plantation.superficie} ha, {disponible} ha encore disponibles).")})
        if self.instance and superficie > 0:
            occupee = somme_superficies(self.instance.blocs.all())
            if superficie < occupee:
                raise serializers.ValidationError({'superficie': f"Inférieure à la superficie de ses blocs ({occupee} ha)."})
        return attrs


class BlocSerializer(serializers.ModelSerializer):
    campement_id = v.RelatedField(source='campement', queryset=Campement.objects.all())
    campement_nom = serializers.CharField(source='campement.nom', read_only=True)
    plantation_id = serializers.IntegerField(source='campement.plantation_id', read_only=True)
    plantation_nom = serializers.CharField(source='campement.plantation.nom', read_only=True)
    nb_personnes = serializers.IntegerField(read_only=True, default=0)
    created_at = serializers.DateTimeField(source='date_creation', read_only=True)

    class Meta:
        model = Bloc
        fields = ['id', 'code', 'nom', 'campement_id', 'campement_nom', 'plantation_id', 'plantation_nom', 'superficie',
                  'unite_superficie', 'nombre_plantes', 'description', 'actif', 'nb_personnes', 'created_at']
        read_only_fields = ['code']
        extra_kwargs = {
            'nombre_plantes': {'required': True, 'error_messages': {
                'required': 'Le nombre de plantes est obligatoire.', 'invalid': 'Nombre de plantes invalide.',
                'min_value': 'Le nombre de plantes ne peut pas être négatif.',
            }},
        }

    def validate_nom(self, value):
        return v.texte_obligatoire(value, 'Le nom')

    def validate_superficie(self, value):
        return v.positif_ou_nul(value, 'La superficie')

    def validate_nombre_plantes(self, value):
        if value is None or value < 0:
            raise serializers.ValidationError('Le nombre de plantes ne peut pas être négatif.')
        if value > 100_000_000:
            raise serializers.ValidationError('Nombre de plantes trop élevé : vérifiez la saisie.')
        return value

    def update(self, instance, validated_data):
        bloc = super().update(instance, validated_data)
        # Les personnes affectées au bloc suivent son campement
        bloc.personnes.exclude(campement_id=bloc.campement_id).update(campement_id=bloc.campement_id)
        return bloc

    def validate(self, attrs):
        campement = attrs.get('campement', getattr(self.instance, 'campement', None))
        nom = attrs.get('nom', getattr(self.instance, 'nom', ''))
        superficie = attrs.get('superficie', getattr(self.instance, 'superficie', Decimal('0')))
        change_campement = self.instance is not None and 'campement' in attrs and self.instance.campement_id != campement.pk

        if self.instance is None or change_campement:
            v.actif(campement, 'Ce campement')
        if change_campement and (self.instance.travaux.exists() or self.instance.depenses.exists()
                                 or self.instance.mouvements_stock.exists() or self.instance.achats_particuliers.exists()):
            raise serializers.ValidationError({'campement_id': (
                "Ce bloc a déjà des opérations enregistrées : il ne peut pas changer de campement.")})
        try:
            v.unique_insensible(campement.blocs, 'nom', nom, self.instance, 'Un bloc de ce campement porte déjà ce nom.')
        except serializers.ValidationError as exc:
            raise serializers.ValidationError({'nom': exc.detail})

        if campement.superficie > 0 and superficie > 0:
            autres = somme_superficies(campement.blocs.all(), exclude=self.instance)
            if autres + superficie > campement.superficie:
                disponible = max(campement.superficie - autres, Decimal('0'))
                raise serializers.ValidationError({'superficie': (
                    f"Dépasse la superficie du campement « {campement.nom} » "
                    f"({campement.superficie} ha, {disponible} ha encore disponibles).")})
        return attrs


class FonctionSerializer(serializers.ModelSerializer):
    """Fonction saisie librement : espaces et majuscules normalisés, jamais deux fois la même."""

    nb_personnes = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = Fonction
        fields = ['id', 'libelle', 'nb_personnes']

    def validate_libelle(self, value):
        value = normaliser_libelle(v.texte_obligatoire(value, 'Le libellé'))
        return v.unique_insensible(Fonction.objects, 'libelle', value, self.instance, 'Cette fonction existe déjà.')


class PersonneSerializer(serializers.ModelSerializer):
    """
    Une personne est affectée à un bloc (son campement suit le bloc). Elle n'existe qu'une fois : nom + prénom
    et téléphone sont uniques (contrôle ici avec un message clair, et contraintes PostgreSQL en dernier rempart).
    """

    bloc_id = v.RelatedField(source='bloc', queryset=Bloc.objects.select_related('campement__plantation'),
                             required=False, allow_null=True)
    campement_id = serializers.IntegerField(read_only=True)
    # Fonction choisie dans la liste (fonction_id) ou saisie librement (fonction_libelle, créée si elle n'existe pas)
    fonction_id = v.RelatedField(queryset=Fonction.objects.all(), write_only=True, required=False, allow_null=True)
    fonction_libelle = serializers.CharField(write_only=True, required=False, allow_blank=True, max_length=100)
    created_at = serializers.DateTimeField(source='date_creation', read_only=True)

    class Meta:
        model = Personne
        fields = ['id', 'matricule', 'nom', 'prenom', 'telephone', 'adresse', 'observation', 'actif', 'date_embauche',
                  'bloc_id', 'campement_id', 'fonction_id', 'fonction_libelle', 'created_at']
        read_only_fields = ['matricule']

    def to_representation(self, instance):
        data = super().to_representation(instance)
        fonction = instance.fonction_actuelle()
        bloc = instance.bloc
        campement = bloc.campement if bloc else instance.campement
        data.update({
            'fonction_id': fonction.pk if fonction else None,
            'fonction_libelle': fonction.libelle if fonction else None,
            'bloc_code': bloc.code if bloc else None,
            'bloc_nom': bloc.nom if bloc else None,
            'campement_id': campement.pk if campement else None,
            'campement_nom': campement.nom if campement else None,
            'plantation_id': campement.plantation_id if campement else None,
            'plantation_nom': campement.plantation.nom if campement else None,
        })
        return data

    def validate_nom(self, value):
        return normaliser_espaces(v.texte_obligatoire(value, 'Le nom'))

    def validate_prenom(self, value):
        return normaliser_espaces(v.texte_obligatoire(value, 'Le prénom'))

    def validate_telephone(self, value):
        value = v.telephone(value)
        doublon = services.telephone_attribue(value, exclure=self.instance)
        if doublon:
            raise serializers.ValidationError(f"Numéro déjà attribué à {doublon.nom_complet} ({doublon.matricule}).")
        return value

    def validate_date_embauche(self, value):
        return v.pas_dans_le_futur(value, "La date d'embauche")

    def validate(self, attrs):
        creation = self.instance is None
        nom = attrs.get('nom', getattr(self.instance, 'nom', ''))
        prenom = attrs.get('prenom', getattr(self.instance, 'prenom', ''))
        doublon = services.personne_en_double(nom, prenom, exclure=self.instance)
        if doublon:
            raise serializers.ValidationError({'nom': (
                f"Cette personne existe déjà : {doublon.nom_complet} ({doublon.matricule}). "
                "Pour un homonyme, ajoutez un second prénom ou une initiale.")})

        bloc = attrs.get('bloc', getattr(self.instance, 'bloc', None))
        if bloc is None:
            raise serializers.ValidationError({'bloc_id': 'Le bloc d\'affectation est obligatoire.'})
        if 'bloc' in attrs and (creation or self.instance.bloc_id != bloc.pk):
            v.actif(bloc, 'Ce bloc')

        fonction = attrs.get('fonction_id')
        libelle = normaliser_libelle(attrs.pop('fonction_libelle', '') or '')
        if fonction is None and libelle:
            attrs['fonction_libelle'] = libelle
        if creation and fonction is None and not libelle:
            raise serializers.ValidationError({'fonction_id': 'La fonction est obligatoire.'})
        return attrs

    @transaction.atomic
    def create(self, validated_data):
        fonction = services.resoudre_fonction(validated_data.pop('fonction_id', None), validated_data.pop('fonction_libelle', ''))
        validated_data.setdefault('date_embauche', timezone.localdate())
        personne = super().create(validated_data)
        services.definir_fonction(personne, fonction, personne.date_embauche)
        return personne

    @transaction.atomic
    def update(self, instance, validated_data):
        fonction = services.resoudre_fonction(validated_data.pop('fonction_id', None), validated_data.pop('fonction_libelle', ''))
        personne = super().update(instance, validated_data)
        if fonction:
            services.definir_fonction(personne, fonction)
        services.oublier_cache(personne, 'fonctions_actuelles')
        return personne


class EquipeSerializer(serializers.ModelSerializer):
    """Équipe créée avec un travail : lecture seule (elle se modifie depuis le travail)."""

    chef_id = serializers.IntegerField(read_only=True)
    chef_nom = serializers.SerializerMethodField()
    created_at = serializers.DateTimeField(source='date_creation', read_only=True)

    class Meta:
        model = Equipe
        fields = ['id', 'code', 'nom', 'actif', 'chef_id', 'chef_nom', 'created_at']

    def get_chef_nom(self, obj):
        return obj.chef.nom_complet if obj.chef else None

    def to_representation(self, instance):
        data = super().to_representation(instance)
        travaux = list(instance.travaux.all())
        data['travaux_ids'] = [t.pk for t in travaux]
        return data
