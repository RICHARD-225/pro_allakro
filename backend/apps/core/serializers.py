from django.db import transaction
from django.utils import timezone
from rest_framework import serializers

from . import services
from . import validators as v
from .models import Bloc, Campement, Equipe, Fonction, Personne, Plantation
from .utils import normaliser_espaces, normaliser_libelle


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
        # Les superficies sont indépendantes : aucune n'est comparée à celle de la plantation, du campement ou des blocs
        return v.positif_ou_nul(value, 'La superficie')


class CampementSerializer(serializers.ModelSerializer):
    plantation_id = v.RelatedField(source='plantation', queryset=Plantation.objects.all())
    plantation_nom = serializers.CharField(source='plantation.nom', read_only=True)
    responsable_id = v.RelatedField(source='responsable', queryset=Personne.objects.all())
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

        if 'plantation' in attrs and (self.instance is None or self.instance.plantation_id != plantation.pk):
            v.actif(plantation, 'Cette plantation')
        responsable = attrs.get('responsable')
        if responsable and (self.instance is None or self.instance.responsable_id != responsable.pk):
            v.actif(responsable, 'Le responsable choisi')
            # Le responsable est un utilisateur actif : superviseur, ou Super admin (qui peut aussi tenir ce rôle)
            compte = getattr(responsable, 'utilisateur', None)
            if compte is None or not compte.actif:
                raise serializers.ValidationError({'responsable_id': (
                    "Le responsable doit être un utilisateur actif (superviseur ou Super admin) : "
                    "créez d'abord son compte dans Administration > Utilisateurs, ou utilisez « Nouveau responsable ».")})
        try:
            v.unique_insensible(plantation.campements, 'nom', nom, self.instance,
                                'Un campement de cette plantation porte déjà ce nom.')
        except serializers.ValidationError as exc:
            raise serializers.ValidationError({'nom': exc.detail})
        return attrs

    @staticmethod
    def rattacher_fiche(campement):
        """La fiche d'un responsable sans campement ni bloc suit le premier campement qu'on lui confie."""
        responsable = campement.responsable
        if responsable.bloc_id is None and responsable.campement_id is None:
            responsable.campement_id = campement.pk
            responsable.save(update_fields=['campement'])

    def create(self, validated_data):
        campement = super().create(validated_data)
        self.rattacher_fiche(campement)
        return campement

    def update(self, instance, validated_data):
        campement = super().update(instance, validated_data)
        self.rattacher_fiche(campement)
        return campement


class BlocSerializer(serializers.ModelSerializer):
    campement_id = v.RelatedField(source='campement', queryset=Campement.objects.all())
    campement_nom = serializers.CharField(source='campement.nom', read_only=True)
    plantation_id = serializers.IntegerField(source='campement.plantation_id', read_only=True)
    plantation_nom = serializers.CharField(source='campement.plantation.nom', read_only=True)
    nb_personnes = serializers.IntegerField(read_only=True, default=0)
    created_at = serializers.DateTimeField(source='date_creation', read_only=True)

    class Meta:
        model = Bloc
        fields = ['id', 'code', 'nom', 'campement_id', 'campement_nom', 'plantation_id', 'plantation_nom', 'localisation',
                  'superficie', 'unite_superficie', 'nombre_plantes', 'description', 'actif', 'nb_personnes', 'created_at']
        read_only_fields = ['code']
        extra_kwargs = {
            # La superficie est facultative pour une plantation et un campement, mais obligatoire pour un bloc
            'superficie': {'required': True, 'error_messages': {
                'required': 'La superficie est obligatoire.', 'invalid': 'Superficie invalide.', 'null': 'La superficie est obligatoire.',
            }},
            'nombre_plantes': {'required': True, 'error_messages': {
                'required': 'Le nombre de plantes est obligatoire.', 'invalid': 'Nombre de plantes invalide.',
                'min_value': 'Le nombre de plantes ne peut pas être négatif.',
            }},
        }

    def validate_nom(self, value):
        return v.texte_obligatoire(value, 'Le nom')

    def validate_superficie(self, value):
        v.positif_ou_nul(value, 'La superficie')
        if value is None or value <= 0:
            raise serializers.ValidationError('La superficie est obligatoire : indiquez-la en hectares.')
        return value

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

    # Une personne est enregistrée au niveau du CAMPEMENT (elle peut travailler sur tous ses blocs). Le bloc n'est plus demandé :
    # il reste accepté (anciennes données) et, s'il est donné, le campement est celui du bloc.
    bloc_id = v.RelatedField(source='bloc', queryset=Bloc.objects.select_related('campement__plantation'),
                             required=False, allow_null=True)
    campement_id = v.RelatedField(source='campement', queryset=Campement.objects.select_related('plantation'),
                                  required=False, allow_null=True)
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
        campement = attrs.get('campement', getattr(self.instance, 'campement', None))
        if bloc is not None:
            if 'bloc' in attrs and (creation or self.instance.bloc_id != bloc.pk):
                v.actif(bloc, 'Ce bloc')
            if attrs.get('campement') is not None and attrs['campement'].pk != bloc.campement_id:
                raise serializers.ValidationError({'campement_id': "Ce bloc n'appartient pas au campement choisi."})
            attrs['campement'] = bloc.campement
        elif campement is None and not self.context.get('sans_campement'):
            raise serializers.ValidationError({'campement_id': 'Le campement est obligatoire.'})
        if attrs.get('campement') is not None and (creation or self.instance.campement_id != attrs['campement'].pk):
            v.actif(attrs['campement'], 'Ce campement')
        if self.instance is not None and attrs.get('actif') is False and self.instance.campements_responsable.exists():
            raise serializers.ValidationError({'actif': (
                "Cette personne est responsable de campement : désignez d'abord un autre responsable "
                "(fiche du campement) avant de la désactiver.")})

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
