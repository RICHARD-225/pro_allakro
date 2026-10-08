from decimal import Decimal

from django.db import transaction
from django.db.models import Sum
from django.utils import timezone
from rest_framework import serializers

from . import services
from . import validators as v
from .models import Bloc, Campement, Equipe, Fonction, Personne, Plantation


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
    created_at = serializers.DateTimeField(source='date_creation', read_only=True)

    class Meta:
        model = Bloc
        fields = ['id', 'code', 'nom', 'campement_id', 'campement_nom', 'plantation_id', 'superficie',
                  'unite_superficie', 'description', 'actif', 'created_at']
        read_only_fields = ['code']

    def validate_nom(self, value):
        return v.texte_obligatoire(value, 'Le nom')

    def validate_superficie(self, value):
        return v.positif_ou_nul(value, 'La superficie')

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
    class Meta:
        model = Fonction
        fields = ['id', 'libelle']

    def validate_libelle(self, value):
        value = v.texte_obligatoire(value, 'Le libellé')
        return v.unique_insensible(Fonction.objects, 'libelle', value, self.instance, 'Cette fonction existe déjà.')


class PersonneSerializer(serializers.ModelSerializer):
    campement_id = v.RelatedField(source='campement', queryset=Campement.objects.all(), allow_null=True, required=False)
    campement_nom = serializers.CharField(source='campement.nom', read_only=True, default=None)
    # Champs « actuels » issus des historiques (fonction principale, équipe) : écrits ici, lus via to_representation
    fonction_id = v.RelatedField(queryset=Fonction.objects.all(), write_only=True, required=False)
    equipe_id = v.RelatedField(queryset=Equipe.objects.all(), write_only=True, required=False, allow_null=True)
    created_at = serializers.DateTimeField(source='date_creation', read_only=True)

    class Meta:
        model = Personne
        fields = ['id', 'matricule', 'nom', 'prenom', 'telephone', 'adresse', 'observation', 'actif',
                  'date_embauche', 'campement_id', 'campement_nom', 'fonction_id', 'equipe_id', 'created_at']
        read_only_fields = ['matricule']

    def to_representation(self, instance):
        data = super().to_representation(instance)
        fonction = instance.fonction_actuelle()
        membership = instance.membership_actuel()
        bloc = services.bloc_de_personne(instance)
        data.update({
            'fonction_id': fonction.pk if fonction else None,
            'fonction_libelle': fonction.libelle if fonction else None,
            'equipe_id': membership.equipe_id if membership else None,
            'equipe_nom': membership.equipe.nom if membership else None,
            'bloc_id': bloc.pk if bloc else None,
            'bloc_code': bloc.code if bloc else None,
        })
        return data

    def validate_nom(self, value):
        return v.texte_obligatoire(value, 'Le nom')

    def validate_prenom(self, value):
        return v.texte_obligatoire(value, 'Le prénom')

    def validate_telephone(self, value):
        value = v.telephone(value)
        if value:
            doublon = Personne.objects.filter(telephone=value)
            if self.instance:
                doublon = doublon.exclude(pk=self.instance.pk)
            doublon = doublon.first()
            if doublon:
                raise serializers.ValidationError(f"Numéro déjà attribué à {doublon.nom_complet} ({doublon.matricule}).")
        return value

    def validate_date_embauche(self, value):
        return v.pas_dans_le_futur(value, "La date d'embauche")

    def validate(self, attrs):
        if self.instance is None and not attrs.get('fonction_id'):
            raise serializers.ValidationError({'fonction_id': 'La fonction est obligatoire.'})
        equipe = attrs.get('equipe_id')
        if equipe:
            v.actif(equipe, "L'équipe choisie")
            affectation = equipe.affectation_actuelle()
            if affectation:
                # Le campement est celui du bloc de l'équipe
                attrs['campement'] = affectation.bloc.campement
        campement = attrs.get('campement', getattr(self.instance, 'campement', None))
        if campement is None:
            raise serializers.ValidationError({'campement_id': 'Le campement est obligatoire (ou choisissez une équipe).'})
        if 'campement' in attrs and (self.instance is None or self.instance.campement_id != campement.pk):
            v.actif(campement, 'Ce campement')
        return attrs

    @transaction.atomic
    def create(self, validated_data):
        fonction = validated_data.pop('fonction_id')
        equipe = validated_data.pop('equipe_id', None)
        validated_data.setdefault('date_embauche', timezone.localdate())
        personne = super().create(validated_data)
        services.definir_fonction(personne, fonction, personne.date_embauche)
        if equipe:
            services.affecter_a_equipe(personne, equipe)
        return personne

    @transaction.atomic
    def update(self, instance, validated_data):
        fonction = validated_data.pop('fonction_id', None)
        has_equipe = 'equipe_id' in validated_data
        equipe = validated_data.pop('equipe_id', None)
        personne = super().update(instance, validated_data)
        if fonction:
            services.definir_fonction(personne, fonction)
        if not personne.actif:
            # Une personne désactivée quitte son équipe
            services.retirer_de_son_equipe(personne)
        elif has_equipe:
            if equipe:
                services.affecter_a_equipe(personne, equipe)
            else:
                services.retirer_de_son_equipe(personne)
        services.oublier_cache(personne, 'memberships_actuels', 'fonctions_actuelles')
        return personne


class EquipeSerializer(serializers.ModelSerializer):
    chef_id = v.RelatedField(source='chef', queryset=Personne.objects.all(), allow_null=True, required=False)
    chef_nom = serializers.SerializerMethodField()
    bloc_id = v.RelatedField(queryset=Bloc.objects.select_related('campement'), write_only=True, required=False)
    membres_ids = serializers.ListField(child=v.RelatedField(queryset=Personne.objects.all()), write_only=True, required=False)
    created_at = serializers.DateTimeField(source='date_creation', read_only=True)

    class Meta:
        model = Equipe
        fields = ['id', 'code', 'nom', 'actif', 'chef_id', 'chef_nom', 'bloc_id', 'membres_ids', 'created_at']
        read_only_fields = ['code']

    def get_chef_nom(self, obj):
        return obj.chef.nom_complet if obj.chef else None

    def to_representation(self, instance):
        data = super().to_representation(instance)
        affectation = instance.affectation_actuelle()
        membres = instance.membres_actuels()
        bloc = affectation.bloc if affectation else None
        data.update({
            'bloc_id': bloc.pk if bloc else None,
            'bloc_code': bloc.code if bloc else None,
            'campement_id': bloc.campement_id if bloc else None,
            'campement_nom': bloc.campement.nom if bloc else None,
            'membres_ids': [m.personne_id for m in membres],
            'nb_membres': len(membres),
        })
        return data

    def validate_nom(self, value):
        value = v.texte_obligatoire(value, 'Le nom')
        return v.unique_insensible(Equipe.objects, 'nom', value, self.instance, 'Une équipe porte déjà ce nom.')

    def validate(self, attrs):
        creation = self.instance is None
        bloc = attrs.get('bloc_id')
        if creation and not bloc:
            raise serializers.ValidationError({'bloc_id': 'Le bloc affecté est obligatoire.'})
        if bloc:
            v.actif(bloc, 'Ce bloc')

        membres = attrs.get('membres_ids')
        if creation and not membres:
            raise serializers.ValidationError({'membres_ids': 'Ajoutez au moins un membre.'})
        if membres is not None:
            if len({m.pk for m in membres}) != len(membres):
                raise serializers.ValidationError({'membres_ids': 'Un membre apparaît plusieurs fois.'})
            inactifs = [m.nom_complet for m in membres if not m.actif]
            if inactifs:
                raise serializers.ValidationError({'membres_ids': f"Personne(s) désactivée(s) : {', '.join(inactifs)}."})

        chef = attrs.get('chef', getattr(self.instance, 'chef', None))
        if creation and not chef:
            raise serializers.ValidationError({'chef_id': "Désignez le chef d'équipe."})
        if chef:
            v.actif(chef, 'Le chef choisi')
            membres_finaux = {m.pk for m in membres} if membres is not None else (
                {m.personne_id for m in self.instance.membres_actuels()} if self.instance else set())
            if chef.pk not in membres_finaux:
                raise serializers.ValidationError({'chef_id': "Le chef doit faire partie des membres de l'équipe."})
        return attrs

    @transaction.atomic
    def create(self, validated_data):
        bloc = validated_data.pop('bloc_id')
        membres = validated_data.pop('membres_ids')
        equipe = super().create(validated_data)
        services.affecter_bloc(equipe, bloc)
        services.definir_membres(equipe, membres)
        # Le chef a pu être retiré d'une autre équipe pendant l'affectation : on le réaffirme ici
        Equipe.objects.filter(pk=equipe.pk).update(chef=validated_data.get('chef'))
        equipe.refresh_from_db()
        return equipe

    @transaction.atomic
    def update(self, instance, validated_data):
        bloc = validated_data.pop('bloc_id', None)
        membres = validated_data.pop('membres_ids', None)
        chef = validated_data.get('chef', instance.chef)
        equipe = super().update(instance, validated_data)
        if bloc:
            services.affecter_bloc(equipe, bloc)
        if membres is not None:
            services.definir_membres(equipe, membres)
        if not equipe.actif:
            # Une équipe désactivée libère ses membres et son bloc
            services.definir_membres(equipe, [])
            services.liberer_bloc(equipe)
            chef = None
        Equipe.objects.filter(pk=equipe.pk).update(chef=chef)
        equipe.refresh_from_db()
        services.oublier_cache(equipe, 'affectations_actuelles', 'membres_en_cours')
        return equipe
