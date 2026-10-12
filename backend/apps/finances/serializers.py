from decimal import Decimal

from django.db import transaction
from django.utils import timezone
from rest_framework import serializers

from apps.core import validators as v
from apps.core.models import Bloc, Campement, Personne
from apps.core.utils import parse_periode, periode_courante

from . import paiements
from .calculs import STATUTS_REMUNERATION, libelle_paye_via, paiement_des_participants, situation_au_paiement, statut_remuneration
from .models import CategorieDepense, Depense, PaiementSalaire, Salaire

ZERO = Decimal('0')


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
                    "Cette catégorie est alimentée automatiquement (achats aux particuliers ou salaires) : "
                    "elle ne peut être ni renommée ni désactivée.")})
        return attrs


def origine_depense(depense):
    """Achat aux particuliers ou paiement de salaire à l'origine de la dépense (sinon saisie directe)."""
    achat = getattr(depense, 'achat_particulier', None)
    if achat:
        return {'type': 'ACHAT', 'id': achat.pk, 'reference': achat.reference}
    paiement = getattr(depense, 'paiement_salaire', None)
    if paiement:
        travail = paiement.salaire.travail
        return {
            'type': 'SALAIRE', 'id': paiement.pk, 'reference': paiement.numero, 'salaire_id': paiement.salaire_id,
            'beneficiaire_nom': paiement.beneficiaire.nom_complet if paiement.beneficiaire_id else None,
            'travail_id': travail.pk if travail else None,
            'activite': travail.activite_libelle if travail else None,
            'est_avance': paiement.est_avance,
        }
    return None


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
        # Le statut n'est jamais saisi : « Payée » pour une dépense saisie ; « Avance » puis « Payée » pour les dépenses
        # automatiques (paiements de salaire, achats), tenu à jour par le serveur
        read_only_fields = ['statut']
        extra_kwargs = {'prix_unitaire': {'required': False}, 'quantite': {'required': False}}

    def get_achat_id(self, obj):
        achat = getattr(obj, 'achat_particulier', None)
        return achat.pk if achat else None

    def to_representation(self, instance):
        data = super().to_representation(instance)
        origine = origine_depense(instance)
        data['origine'] = origine
        data['modifiable'] = origine is None
        return data

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
                    "Catégorie automatique : les achats aux particuliers et les salaires s'enregistrent depuis leurs pages.")})
            v.actif(categorie, 'Cette catégorie')
        bloc = attrs.get('bloc')
        if bloc is not None and (self.instance is None or self.instance.bloc_id != bloc.pk):
            if not bloc.actif:
                raise serializers.ValidationError({'bloc_id': 'Ce bloc est désactivé.'})
        prix = attrs.get('prix_unitaire', getattr(self.instance, 'prix_unitaire', Decimal('0')))
        montant = attrs.get('montant_total', getattr(self.instance, 'montant_total', Decimal('0')))
        if not prix and (montant is None or montant <= 0):
            raise serializers.ValidationError({'montant_total': 'Le montant doit être supérieur à 0.'})
        if self.instance is not None and 'montant_total' in attrs and 'prix_unitaire' not in attrs:
            # Un nouveau montant saisi seul redéfinit le prix unitaire (quantité inchangée)
            quantite = attrs.get('quantite', self.instance.quantite) or Decimal('1')
            attrs['prix_unitaire'] = (attrs['montant_total'] / quantite).quantize(Decimal('0.01'))
        return attrs


def _periode_vers_dates(attrs, debut='date_debut', fin='date_fin'):
    if 'periode' in attrs:
        attrs[debut], attrs[fin] = parse_periode(attrs.pop('periode'))
    return attrs


def _resume_paiement(paiement, chef_id):
    return {
        'id': paiement.pk, 'numero': paiement.numero, 'date': paiement.date_paiement, 'montant': float(paiement.montant),
        'beneficiaire_id': paiement.beneficiaire_id,
        'beneficiaire_nom': paiement.beneficiaire.nom_complet if paiement.beneficiaire_id else None,
        'type_paiement': paiement.type_paiement, 'est_avance': paiement.est_avance,
        'reference': paiement.reference, 'observation': paiement.observation,
        'annule': paiement.annule, 'date_annulation': paiement.date_annulation, 'motif_annulation': paiement.motif_annulation,
        'via_chef': paiement.beneficiaire_id == chef_id,
    }


class SalaireSerializer(serializers.ModelSerializer):
    """
    Rémunération à payer.
    - Celle d'un travail est générée et tenue à jour avec le travail (on la corrige en modifiant le travail).
    - Une rémunération manuelle (« Nouvelle rémunération ») concerne une personne et un mois (une seule par mois).
    - Aucune rémunération ne se modifie directement : pour corriger une saisie manuelle, on l'annule (tant qu'elle n'a
      aucun paiement) puis on la ressaisit ; l'historique financier est ainsi toujours conservé.
    """

    personne_id = v.RelatedField(source='personne', queryset=Personne.objects.select_related('bloc'), required=False)
    periode = serializers.CharField(validators=[v.periode], default=periode_courante)
    libelle = serializers.CharField(required=False, allow_blank=True, max_length=255)

    class Meta:
        model = Salaire
        fields = ['id', 'personne_id', 'periode', 'libelle', 'montant_brut', 'montant_ponction', 'montant_net', 'observation']
        read_only_fields = ['montant_net']
        extra_kwargs = {'montant_brut': {'required': False}}

    def to_representation(self, salaire):
        data = super().to_representation(salaire)
        tous_les_paiements = list(salaire.paiements.all())  # l'historique garde les paiements annulés
        versements = [p for p in tous_les_paiements if not p.annule]  # seuls ceux-ci comptent
        paye = sum((p.montant for p in versements), ZERO)
        statut = statut_remuneration(salaire, paye)
        travail = salaire.travail
        bloc = salaire.bloc
        campement = bloc.campement if bloc else salaire.personne.campement
        participants = travail.participants_actuels() if travail else []
        situation = paiement_des_participants(salaire, participants, versements, statut) if travail else []
        for ligne in situation:
            ligne['paye_via_libelle'] = libelle_paye_via(ligne)
        beneficiaires = paiements.beneficiaires_possibles(salaire)
        roles = {p.personne_id: p.get_role_lors_du_travail_display() for p in participants}
        data.update({
            'origine': 'TRAVAIL' if travail else 'MANUELLE',
            'personne_nom': salaire.personne.nom_complet,
            'matricule': salaire.personne.matricule,
            'date_debut': salaire.date_debut,
            'date_fin': salaire.date_fin,
            'montant_du': float(salaire.montant_net),
            'montant_paye': float(paye),
            'reste': 0.0 if statut == 'ANNULEE' else float(max(salaire.montant_net - paye, ZERO)),
            'statut': statut,
            'statut_libelle': STATUTS_REMUNERATION[statut],
            'annulee': salaire.est_annulee,
            'avance': float(sum((p.montant for p in versements if p.est_avance), ZERO)),
            'date_dernier_paiement': max((p.date_paiement for p in versements), default=None),
            'bloc_id': bloc.pk if bloc else None,
            'bloc_code': bloc.code if bloc else None,
            'campement_id': campement.pk if campement else None,
            'campement_nom': campement.nom if campement else None,
            'plantation_nom': campement.plantation.nom if campement else None,
            'travail': {
                'id': travail.pk, 'activite': travail.activite_libelle, 'unite': travail.unite,
                'quantite': float(travail.quantite), 'prix_unitaire': float(travail.prix_unitaire),
                'montant_total': float(travail.montant_total), 'date_debut': travail.date_travail, 'date_fin': travail.date_fin,
                'statut': travail.statut, 'statut_libelle': travail.get_statut_display(),
            } if travail else None,
            'equipe': {
                'id': travail.equipe_id, 'nom': travail.equipe.nom, 'chef_id': salaire.personne_id,
                'chef_nom': salaire.personne.nom_complet,
            } if travail and travail.equipe_id else None,
            'participants': situation,
            'beneficiaires': [{'id': p.pk, 'nom': p.nom_complet, 'matricule': p.matricule,
                               'role': roles.get(p.pk, 'Titulaire')} for p in beneficiaires],
            'paiements': [_resume_paiement(p, salaire.personne_id) for p in sorted(tous_les_paiements, key=lambda p: (p.date_paiement, p.pk))],
            'peut_annuler': not travail and not versements and not salaire.annulee,
        })
        return data

    def validate_montant_brut(self, value):
        return v.strictement_positif(value, 'Le montant brut')

    def validate_montant_ponction(self, value):
        return v.positif_ou_nul(value, 'La ponction')

    def update(self, instance, validated_data):
        raise serializers.ValidationError({'detail': (
            "Une rémunération ne se modifie pas : modifiez le travail qui l'a générée, "
            "ou annulez la saisie manuelle (si elle n'a aucun paiement) puis ressaisissez-la.")})

    def validate(self, attrs):
        attrs = _periode_vers_dates(attrs)
        personne = attrs.get('personne')
        if personne is None:
            raise serializers.ValidationError({'personne_id': 'La personne est obligatoire.'})
        v.actif(personne, 'Cette personne')
        brut = attrs.get('montant_brut')
        if brut is None:
            raise serializers.ValidationError({'montant_brut': 'Le montant brut est obligatoire.'})
        ponction = attrs.get('montant_ponction') or ZERO
        if ponction > brut:
            raise serializers.ValidationError({'montant_ponction': 'La ponction ne peut pas dépasser le montant brut.'})
        debut = attrs['date_debut']
        if Salaire.objects.filter(personne=personne, date_debut=debut, travail__isnull=True).exists():
            raise serializers.ValidationError({'periode': (
                f"{personne.nom_complet} a déjà une rémunération manuelle pour {v.libelle_periode(debut.strftime('%Y-%m'))}.")})
        if not attrs.get('libelle'):
            attrs['libelle'] = f"Rémunération {v.libelle_periode(debut.strftime('%Y-%m'))}"
        attrs['bloc'] = personne.bloc
        return attrs


class PaiementSalaireSerializer(serializers.ModelSerializer):
    """Paiement d'une rémunération à un bénéficiaire (chef d'équipe par défaut, ou un membre, ou la personne seule)."""

    salaire_id = v.RelatedField(source='salaire', queryset=Salaire.objects.select_related('personne', 'travail', 'bloc'))
    beneficiaire_id = v.RelatedField(source='beneficiaire', queryset=Personne.objects.all(), required=False, allow_null=True)
    date = serializers.DateField(source='date_paiement', default=timezone.localdate)

    class Meta:
        model = PaiementSalaire
        fields = ['id', 'numero', 'salaire_id', 'beneficiaire_id', 'montant', 'date', 'type_paiement', 'reference',
                  'est_avance', 'groupe', 'observation', 'annule', 'date_annulation', 'motif_annulation']
        read_only_fields = ['numero', 'est_avance', 'groupe', 'annule', 'date_annulation', 'motif_annulation']

    def to_representation(self, paiement):
        data = super().to_representation(paiement)
        salaire = paiement.salaire
        travail = salaire.travail
        bloc = salaire.bloc
        campement = bloc.campement if bloc else salaire.personne.campement
        beneficiaire = paiement.beneficiaire or salaire.personne
        en_equipe = bool(travail and travail.equipe_id)
        situation = situation_au_paiement(paiement)
        data.update({
            # Situation de la rémunération après ce paiement (reprise sur le reçu)
            'montant_du': float(situation['net']),
            'total_paye': float(situation['paye']),
            'reste_apres': float(situation['reste']),
            'periode_debut': salaire.date_debut,
            'periode_fin': salaire.date_fin,
            'beneficiaire_id': beneficiaire.pk,
            'beneficiaire_nom': beneficiaire.nom_complet,
            'beneficiaire_matricule': beneficiaire.matricule,
            'titulaire_id': salaire.personne_id,
            'titulaire_nom': salaire.personne.nom_complet,
            'via_chef': en_equipe and beneficiaire.pk == salaire.personne_id,
            'salaire_libelle': salaire.libelle,
            'periode': salaire.date_debut.strftime('%Y-%m'),
            'mode': 'EQUIPE' if en_equipe else 'INDIVIDUEL',
            'travail_id': travail.pk if travail else None,
            'activite': travail.activite_libelle if travail else None,
            'equipe_nom': travail.equipe.nom if en_equipe else None,
            'bloc_id': bloc.pk if bloc else None,
            'bloc_code': bloc.code if bloc else None,
            'campement_nom': campement.nom if campement else None,
            'depense_id': paiement.depense_id,
        })
        return data

    def validate_montant(self, value):
        return v.strictement_positif(value, 'Le montant')

    def validate_date(self, value):
        return v.pas_dans_le_futur(value, 'La date de paiement')

    def validate(self, attrs):
        if self.instance is not None and 'salaire' in attrs and attrs['salaire'].pk != self.instance.salaire_id:
            raise serializers.ValidationError({'salaire_id': "Un paiement ne change pas de rémunération : supprimez-le et ressaisissez-le."})
        return attrs

    def create(self, validated_data):
        return paiements.enregistrer_paiement(
            validated_data['salaire'], validated_data['montant'], validated_data['date_paiement'],
            validated_data['type_paiement'], beneficiaire=validated_data.get('beneficiaire'),
            reference=validated_data.get('reference', ''), observation=validated_data.get('observation', ''),
        )

    def update(self, instance, validated_data):
        validated_data.pop('salaire', None)
        if 'beneficiaire' in validated_data and validated_data['beneficiaire'] is None:
            validated_data['beneficiaire'] = instance.salaire.personne
        return paiements.modifier_paiement(instance, **validated_data)


class LigneLotSerializer(serializers.Serializer):
    salaire_id = v.RelatedField(queryset=Salaire.objects.select_related('personne', 'travail'))
    montant = serializers.DecimalField(max_digits=15, decimal_places=2)

    def validate_montant(self, value):
        return v.strictement_positif(value, 'Le montant')


class PaiementLotSerializer(serializers.Serializer):
    """« Nouveau paiement » : une ou plusieurs rémunérations payées ensemble à un même bénéficiaire (tout ou rien)."""

    beneficiaire_id = v.RelatedField(queryset=Personne.objects.all())
    date = serializers.DateField(default=timezone.localdate)
    type_paiement = serializers.ChoiceField(choices=PaiementSalaire.TypePaiement.choices)
    reference = serializers.CharField(required=False, allow_blank=True, default='', max_length=150)
    observation = serializers.CharField(required=False, allow_blank=True, default='')
    lignes = LigneLotSerializer(many=True)

    def validate_date(self, value):
        return v.pas_dans_le_futur(value, 'La date de paiement')

    def validate(self, attrs):
        beneficiaire, lignes = attrs['beneficiaire_id'], attrs['lignes']
        if not lignes:
            raise serializers.ValidationError({'lignes': 'Sélectionnez au moins une rémunération à payer.'})
        erreurs, vues, en_erreur = [], set(), False
        for ligne in lignes:
            salaire, erreur = ligne['salaire_id'], {}
            if salaire.pk in vues:
                erreur['salaire_id'] = 'Rémunération en double.'
            elif salaire.est_annulee:
                erreur['salaire_id'] = 'Cette rémunération est annulée.'
            elif beneficiaire.pk not in {p.pk for p in paiements.beneficiaires_possibles(salaire)}:
                erreur['salaire_id'] = f"{beneficiaire.nom_complet} n'est pas concerné(e) par « {salaire.libelle} »."
            else:
                reste = salaire.montant_net - paiements.montant_paye(salaire)
                if ligne['montant'] > reste:
                    erreur['montant'] = f"Dépasse le reste à payer ({reste.normalize():f} FCFA)."
            vues.add(salaire.pk)
            erreurs.append(erreur)
            en_erreur = en_erreur or bool(erreur)
        if en_erreur:
            raise serializers.ValidationError({'lignes': erreurs})
        return attrs

    @transaction.atomic
    def create(self, validated_data):
        beneficiaire = validated_data['beneficiaire_id']
        groupe = f"LOT-{timezone.now():%Y%m%d%H%M%S}-{beneficiaire.pk}" if len(validated_data['lignes']) > 1 else ''
        return [
            paiements.enregistrer_paiement(
                ligne['salaire_id'], ligne['montant'], validated_data['date'], validated_data['type_paiement'],
                beneficiaire=beneficiaire, reference=validated_data['reference'], observation=validated_data['observation'],
                groupe=groupe,
            )
            for ligne in validated_data['lignes']
        ]
