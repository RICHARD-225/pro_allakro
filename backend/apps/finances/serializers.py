from decimal import Decimal

from django.db import transaction
from django.utils import timezone
from rest_framework import serializers

from apps.core import services as personnel
from apps.core import validators as v
from apps.core.models import Bloc, Campement, Equipe, Personne
from apps.core.utils import parse_periode, periode_courante

from .calculs import montant_paye_salaire, realise_prevision, statut_paiement
from .models import CategorieDepense, Depense, PaiementSalaire, Prevision, Salaire


class CategorieDepenseSerializer(serializers.ModelSerializer):
    systeme = serializers.BooleanField(read_only=True)

    class Meta:
        model = CategorieDepense
        fields = ['id', 'code', 'libelle', 'actif', 'systeme']
        read_only_fields = ['code']

    def validate_libelle(self, value):
        value = v.texte_obligatoire(value, 'Le libellé')
        return v.unique_insensible(CategorieDepense.objects, 'libelle', value, self.instance, 'Cette catégorie existe déjà.')

    def validate(self, attrs):
        if self.instance and self.instance.systeme:
            if attrs.get('actif') is False or ('libelle' in attrs and attrs['libelle'] != self.instance.libelle):
                raise serializers.ValidationError({'detail': (
                    "Cette catégorie est alimentée automatiquement par les achats aux particuliers : "
                    "elle ne peut être ni renommée ni désactivée.")})
        return attrs


class DepenseSerializer(serializers.ModelSerializer):
    categorie_id = v.RelatedField(source='categorie', queryset=CategorieDepense.objects.all())
    categorie = serializers.CharField(source='categorie.libelle', read_only=True)
    bloc_id = v.RelatedField(source='bloc', queryset=Bloc.objects.select_related('campement'))
    bloc_code = serializers.CharField(source='bloc.code', read_only=True, default=None)
    campement_id = serializers.IntegerField(read_only=True)
    campement_nom = serializers.CharField(source='campement.nom', read_only=True)
    date = serializers.DateField(source='date_depense', default=timezone.localdate)
    periode = serializers.CharField(read_only=True)
    achat_id = serializers.SerializerMethodField()
    created_at = serializers.DateTimeField(source='date_creation', read_only=True)

    class Meta:
        model = Depense
        fields = ['id', 'designation', 'categorie_id', 'categorie', 'bloc_id', 'bloc_code', 'campement_id',
                  'campement_nom', 'date', 'periode', 'quantite', 'unite', 'prix_unitaire', 'montant_total',
                  'statut', 'numero_justificatif', 'observation', 'achat_id', 'created_at']
        extra_kwargs = {'prix_unitaire': {'required': False}, 'quantite': {'required': False}}

    def get_achat_id(self, obj):
        achat = getattr(obj, 'achat_particulier', None)
        return achat.pk if achat else None

    def validate_designation(self, value):
        return v.texte_obligatoire(value, 'La désignation')

    def validate_date(self, value):
        return v.pas_dans_le_futur(value, 'La date de la dépense')

    def validate_quantite(self, value):
        return v.strictement_positif(value, 'La quantité')

    def validate_prix_unitaire(self, value):
        return v.positif_ou_nul(value, 'Le prix unitaire')

    def validate(self, attrs):
        categorie = attrs.get('categorie')
        if categorie is not None and (self.instance is None or self.instance.categorie_id != categorie.pk):
            if categorie.systeme and not self.context.get('depuis_achat'):
                raise serializers.ValidationError({'categorie_id': (
                    "Les achats aux particuliers s'enregistrent depuis la page « Achats particuliers ».")})
            v.actif(categorie, 'Cette catégorie')
        bloc = attrs.get('bloc')
        if bloc is not None and (self.instance is None or self.instance.bloc_id != bloc.pk):
            if not bloc.actif:
                raise serializers.ValidationError({'bloc_id': 'Ce bloc est désactivé.'})
        prix = attrs.get('prix_unitaire', getattr(self.instance, 'prix_unitaire', Decimal('0')))
        montant = attrs.get('montant_total', getattr(self.instance, 'montant_total', Decimal('0')))
        if not prix and (montant is None or montant <= 0):
            raise serializers.ValidationError({'montant_total': 'Le montant doit être supérieur à 0.'})
        return attrs


def _periode_vers_dates(attrs, debut='date_debut', fin='date_fin'):
    if 'periode' in attrs:
        attrs[debut], attrs[fin] = parse_periode(attrs.pop('periode'))
    return attrs


class SalaireSerializer(serializers.ModelSerializer):
    personne_id = v.RelatedField(source='personne', queryset=Personne.objects.all())
    personne_nom = serializers.CharField(source='personne.nom_complet', read_only=True)
    matricule = serializers.CharField(source='personne.matricule', read_only=True)
    periode = serializers.CharField(validators=[v.periode], default=periode_courante)

    class Meta:
        model = Salaire
        fields = ['id', 'personne_id', 'personne_nom', 'matricule', 'periode', 'montant_brut', 'montant_ponction',
                  'montant_net', 'observation']
        read_only_fields = ['montant_net']

    def to_representation(self, instance):
        data = super().to_representation(instance)
        paye = montant_paye_salaire(instance)
        bloc = personnel.bloc_de_personne(instance.personne)
        membership = instance.personne.membership_actuel()
        data.update({
            'montant_du': float(instance.montant_net),
            'montant_paye': float(paye),
            'reste': float(max(instance.montant_net - paye, Decimal('0'))),
            'statut': statut_paiement(instance.montant_net, paye),
            'date_dernier_paiement': getattr(instance, 'date_dernier_paiement', None),
            'equipe_id': membership.equipe_id if membership else None,
            'bloc_id': bloc.pk if bloc else None,
            'bloc_code': bloc.code if bloc else None,
        })
        return data

    def validate_montant_brut(self, value):
        return v.strictement_positif(value, 'Le montant brut')

    def validate_montant_ponction(self, value):
        return v.positif_ou_nul(value, 'La ponction')

    def validate(self, attrs):
        attrs = _periode_vers_dates(attrs)
        personne = attrs.get('personne', getattr(self.instance, 'personne', None))
        debut = attrs.get('date_debut', getattr(self.instance, 'date_debut', None))
        brut = attrs.get('montant_brut', getattr(self.instance, 'montant_brut', Decimal('0')))
        ponction = attrs.get('montant_ponction', getattr(self.instance, 'montant_ponction', Decimal('0')))

        if self.instance is None:
            v.actif(personne, 'Cette personne')
        if ponction > brut:
            raise serializers.ValidationError({'montant_ponction': 'La ponction ne peut pas dépasser le montant brut.'})
        doublon = Salaire.objects.filter(personne=personne, date_debut=debut)
        if self.instance:
            doublon = doublon.exclude(pk=self.instance.pk)
        if doublon.exists():
            raise serializers.ValidationError({'periode': (
                f"{personne.nom_complet} a déjà une rémunération pour {v.libelle_periode(debut.strftime('%Y-%m'))}.")})
        if self.instance:
            deja_paye = montant_paye_salaire(self.instance)
            if brut - ponction < deja_paye:
                raise serializers.ValidationError({'montant_brut': (
                    f"Le net ({brut - ponction}) serait inférieur au montant déjà payé ({deja_paye}).")})
        return attrs


class PaiementSalaireSerializer(serializers.ModelSerializer):
    """Paiement individuel : rattaché automatiquement à la rémunération de la personne sur la période."""

    personne_id = v.RelatedField(queryset=Personne.objects.all(), write_only=True)
    periode = serializers.CharField(write_only=True, validators=[v.periode], default=periode_courante)
    date = serializers.DateField(source='date_paiement', default=timezone.localdate)

    class Meta:
        model = PaiementSalaire
        fields = ['id', 'personne_id', 'periode', 'montant', 'date', 'type_paiement', 'reference', 'observation']

    def to_representation(self, instance):
        data = super().to_representation(instance)
        salaire = instance.salaire
        personne = salaire.personne
        bloc = None
        if instance.equipe_id:
            affectation = instance.equipe.affectation_actuelle()
            bloc = affectation.bloc if affectation else None
        else:
            bloc = personnel.bloc_de_personne(personne)
        data.update({
            'salaire_id': salaire.pk,
            'personne_id': personne.pk,
            'personne_nom': personne.nom_complet,
            'matricule': personne.matricule,
            'periode': salaire.periode,
            'mode': 'EQUIPE' if instance.groupe else 'INDIVIDUEL',
            'groupe': instance.groupe or None,
            'equipe_id': instance.equipe_id,
            'equipe_nom': instance.equipe.nom if instance.equipe_id else None,
            'bloc_id': bloc.pk if bloc else None,
            'bloc_code': bloc.code if bloc else None,
        })
        return data

    def validate_montant(self, value):
        return v.strictement_positif(value, 'Le montant')

    def validate_date(self, value):
        return v.pas_dans_le_futur(value, 'La date de paiement')

    def validate(self, attrs):
        personne, periode = attrs['personne_id'], attrs['periode']
        debut, _ = parse_periode(periode)
        salaire = Salaire.objects.filter(personne=personne, date_debut=debut).first()
        if salaire is None:
            raise serializers.ValidationError({'periode': (
                f"Aucune rémunération enregistrée pour {personne.nom_complet} en {v.libelle_periode(periode)}.")})
        attrs['salaire'] = salaire
        return attrs

    @transaction.atomic
    def create(self, validated_data):
        validated_data.pop('personne_id')
        validated_data.pop('periode')
        # Verrou sur la rémunération : deux paiements simultanés ne peuvent pas dépasser le dû
        salaire = Salaire.objects.select_for_update().get(pk=validated_data['salaire'].pk)
        reste = salaire.montant_net - montant_paye_salaire(salaire)
        if validated_data['montant'] > reste:
            raise serializers.ValidationError({'montant': [f"Dépasse le reste à payer ({reste} FCFA)."]})
        validated_data['salaire'] = salaire
        return super().create(validated_data)


class LignePaiementSerializer(serializers.Serializer):
    personne_id = v.RelatedField(queryset=Personne.objects.all())
    montant = serializers.DecimalField(max_digits=15, decimal_places=2)

    def validate_montant(self, value):
        return v.strictement_positif(value, 'Le montant')


class PaiementGroupeSerializer(serializers.Serializer):
    """Paiement de plusieurs membres d'une équipe en une seule opération (tout ou rien)."""

    equipe_id = v.RelatedField(queryset=Equipe.objects.all())
    periode = serializers.CharField(validators=[v.periode], default=periode_courante)
    date = serializers.DateField(default=timezone.localdate)
    type_paiement = serializers.ChoiceField(choices=PaiementSalaire.TypePaiement.choices)
    reference = serializers.CharField(required=False, allow_blank=True, default='')
    lignes = LignePaiementSerializer(many=True)

    def validate_date(self, value):
        return v.pas_dans_le_futur(value, 'La date de paiement')

    def validate(self, attrs):
        equipe, periode, lignes = attrs['equipe_id'], attrs['periode'], attrs['lignes']
        if not lignes:
            raise serializers.ValidationError({'lignes': 'Sélectionnez au moins un membre à payer.'})
        debut, _ = parse_periode(periode)
        membres = {m.personne_id for m in equipe.membres_actuels()}
        salaires = {s.personne_id: s for s in Salaire.objects.filter(date_debut=debut, personne_id__in=[l['personne_id'].pk for l in lignes])}

        erreurs, vus, has_error = [], set(), False
        for ligne in lignes:
            personne, err = ligne['personne_id'], {}
            if personne.pk in vus:
                err['personne_id'] = 'Personne en double.'
            elif personne.pk not in membres:
                err['personne_id'] = f"{personne.nom_complet} ne fait pas partie de l'équipe {equipe.nom}."
            salaire = salaires.get(personne.pk)
            if salaire is None:
                err['montant'] = f"Aucune rémunération pour {personne.nom_complet} en {v.libelle_periode(periode)}."
            else:
                reste = salaire.montant_net - montant_paye_salaire(salaire)
                if ligne['montant'] > reste:
                    err['montant'] = f"Dépasse le reste à payer de {personne.nom_complet} ({reste} FCFA)."
            vus.add(personne.pk)
            erreurs.append(err)
            has_error = has_error or bool(err)
        if has_error:
            raise serializers.ValidationError({'lignes': erreurs})
        attrs['salaires'] = salaires
        return attrs

    @transaction.atomic
    def create(self, validated_data):
        equipe = validated_data['equipe_id']
        groupe = f"GRP-{timezone.now():%Y%m%d%H%M%S}-{equipe.pk}"
        ids = [s.pk for s in validated_data['salaires'].values()]
        verrouilles = {s.personne_id: s for s in Salaire.objects.select_for_update().filter(pk__in=ids)}
        paiements = []
        for ligne in validated_data['lignes']:
            salaire = verrouilles[ligne['personne_id'].pk]
            reste = salaire.montant_net - montant_paye_salaire(salaire)
            if ligne['montant'] > reste:
                raise serializers.ValidationError({'detail': f"Le reste de {salaire.personne.nom_complet} a changé ({reste} FCFA)."})
            paiements.append(PaiementSalaire.objects.create(
                salaire=salaire, montant=ligne['montant'], date_paiement=validated_data['date'],
                type_paiement=validated_data['type_paiement'], reference=validated_data['reference'],
                equipe=equipe, groupe=groupe,
            ))
        return paiements


class PrevisionSerializer(serializers.ModelSerializer):
    campement_id = v.RelatedField(source='campement', queryset=Campement.objects.all())
    campement_nom = serializers.CharField(source='campement.nom', read_only=True)
    bloc_id = v.RelatedField(source='bloc', queryset=Bloc.objects.all(), allow_null=True, required=False)
    bloc_code = serializers.CharField(source='bloc.code', read_only=True, default=None)
    categorie_id = v.RelatedField(source='categorie', queryset=CategorieDepense.objects.all())
    categorie = serializers.CharField(source='categorie.libelle', read_only=True)
    periode = serializers.CharField(validators=[v.periode], default=periode_courante)

    class Meta:
        model = Prevision
        fields = ['id', 'campement_id', 'campement_nom', 'bloc_id', 'bloc_code', 'categorie_id', 'categorie',
                  'periode', 'designation', 'montant_prevu', 'observation']
        extra_kwargs = {'designation': {'required': False, 'allow_blank': True}}

    def to_representation(self, instance):
        data = super().to_representation(instance)
        realise = realise_prevision(instance)
        prevu = instance.montant_prevu
        data.update({
            'realise': float(realise),
            'ecart': float(realise - prevu),
            'taux': round(float(realise / prevu * 100), 1) if prevu else None,
        })
        return data

    def validate_montant_prevu(self, value):
        return v.strictement_positif(value, 'Le montant prévu')

    def validate(self, attrs):
        attrs = _periode_vers_dates(attrs, 'periode_debut', 'periode_fin')
        campement = attrs.get('campement', getattr(self.instance, 'campement', None))
        bloc = attrs.get('bloc', getattr(self.instance, 'bloc', None))
        categorie = attrs.get('categorie', getattr(self.instance, 'categorie', None))
        debut = attrs.get('periode_debut', getattr(self.instance, 'periode_debut', None))
        if bloc and bloc.campement_id != campement.pk:
            raise serializers.ValidationError({'bloc_id': "Ce bloc n'appartient pas au campement choisi."})
        doublon = Prevision.objects.filter(campement=campement, bloc=bloc, categorie=categorie, periode_debut=debut)
        if self.instance:
            doublon = doublon.exclude(pk=self.instance.pk)
        if doublon.exists():
            raise serializers.ValidationError({'categorie_id': 'Une prévision existe déjà pour cette catégorie, ce périmètre et cette période.'})
        if not attrs.get('designation') and self.instance is None:
            attrs['designation'] = f"Budget {categorie.libelle} {debut:%m/%Y}"
        return attrs
