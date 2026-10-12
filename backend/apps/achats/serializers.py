from decimal import Decimal

from django.db import transaction
from django.db.models import Sum
from django.utils import timezone
from rest_framework import serializers

from apps.core import validators as v
from apps.core.models import Bloc
from apps.core.unites import UNITES
from apps.finances.calculs import statut_paiement
from apps.finances.models import CategorieDepense, Depense

from .models import AchatParticulier, PaiementAchat, Particulier

ZERO = Decimal('0')


def montant_paye(achat):
    if hasattr(achat, 'montant_paye'):
        return achat.montant_paye
    return achat.paiements.aggregate(total=Sum('montant'))['total'] or ZERO


def synchroniser_depense(achat):
    """
    La dépense liée reflète ce qui a été VERSÉ au vendeur, pas le montant total de l'achat : seule l'avance versée
    apparaît dans Dépenses, puis la dépense grossit à chaque règlement. Elle est « Avance » tant que l'achat n'est pas
    soldé, « Payée » ensuite. Tant que rien n'a été versé, il n'y a pas de dépense.
    """
    paye = montant_paye(achat)
    if paye <= 0:
        if achat.depense_id:
            depense = achat.depense
            AchatParticulier.objects.filter(pk=achat.pk).update(depense=None)
            achat.depense = None
            depense.delete()
        return None
    vendeur = achat.particulier
    valeurs = {
        'categorie': CategorieDepense.achat_particuliers(),
        'bloc': achat.bloc,
        'campement_id': achat.campement_id,
        'date_depense': achat.date_achat,
        'designation': f"{achat.designation} — {vendeur} ({achat.reference})"[:255],
        'quantite': 1,
        'unite': '',
        'prix_unitaire': paye,
        'montant_total': paye,
        'statut': Depense.Statut.PAYEE if paye >= achat.montant_total else Depense.Statut.AVANCE,
    }
    if achat.depense_id:
        depense = achat.depense
        for champ, valeur in valeurs.items():
            setattr(depense, champ, valeur)
        depense.save()
    else:
        depense = Depense.objects.create(**valeurs)
        AchatParticulier.objects.filter(pk=achat.pk).update(depense=depense)
        achat.depense = depense
    return depense


class ParticulierSerializer(serializers.ModelSerializer):
    nb_achats = serializers.IntegerField(read_only=True, default=0)
    total_achats = serializers.DecimalField(max_digits=15, decimal_places=2, read_only=True, default=0)

    class Meta:
        model = Particulier
        fields = ['id', 'nom', 'prenom', 'telephone', 'adresse', 'observation', 'actif', 'nb_achats', 'total_achats']

    def validate_nom(self, value):
        return v.texte_obligatoire(value, 'Le nom')

    def validate_telephone(self, value):
        return v.telephone(value)


class AchatParticulierSerializer(serializers.ModelSerializer):
    """
    Création : on choisit un vendeur existant (`particulier_id`) ou on en saisit un nouveau (`particulier_nom`).
    Montant = poids × prix unitaire (calculé ici). `montant_verse` = somme payée au vendeur au moment de l'achat.
    """

    particulier_id = v.RelatedField(source='particulier', queryset=Particulier.objects.all(), required=False, allow_null=True)
    particulier_nom = serializers.CharField(write_only=True, required=False, allow_blank=True)
    particulier_telephone = serializers.CharField(write_only=True, required=False, allow_blank=True)
    bloc_id = v.RelatedField(source='bloc', queryset=Bloc.objects.select_related('campement'))
    bloc_code = serializers.CharField(source='bloc.code', read_only=True, default=None)
    campement_id = serializers.IntegerField(read_only=True)
    campement_nom = serializers.CharField(source='campement.nom', read_only=True)
    date_achat = serializers.DateField(default=timezone.localdate)
    unite_poids = serializers.ChoiceField(choices=UNITES, default='kg')
    montant_verse = serializers.DecimalField(max_digits=15, decimal_places=2, write_only=True, required=False)
    type_paiement = serializers.ChoiceField(choices=PaiementAchat.TypePaiement.choices, write_only=True, required=False,
                                            default=PaiementAchat.TypePaiement.ESPECES)

    class Meta:
        model = AchatParticulier
        fields = ['id', 'reference', 'particulier_id', 'particulier_nom', 'particulier_telephone', 'designation',
                  'poids', 'unite_poids', 'prix_unitaire', 'montant_total', 'date_achat', 'bloc_id', 'bloc_code',
                  'campement_id', 'campement_nom', 'montant_verse', 'type_paiement', 'observation']
        read_only_fields = ['reference', 'montant_total']

    def to_representation(self, instance):
        data = super().to_representation(instance)
        paye = montant_paye(instance)
        data.update({
            'particulier_nom': str(instance.particulier),
            'particulier_telephone': instance.particulier.telephone,
            'montant_paye': float(paye),
            'reste': float(max(instance.montant_total - paye, ZERO)),
            'statut': statut_paiement(instance.montant_total, paye),
            'depense_id': instance.depense_id,
        })
        return data

    def validate_designation(self, value):
        return v.texte_obligatoire(value, 'Le produit')

    def validate_poids(self, value):
        return v.strictement_positif(value, 'Le poids / la quantité')

    def validate_prix_unitaire(self, value):
        return v.strictement_positif(value, 'Le prix unitaire')

    def validate_date_achat(self, value):
        return v.pas_dans_le_futur(value, "La date d'achat")

    def validate_particulier_telephone(self, value):
        return v.telephone(value)

    def validate_montant_verse(self, value):
        return v.positif_ou_nul(value, 'Le montant versé')

    def validate(self, attrs):
        get = lambda key: attrs.get(key, getattr(self.instance, key, None))  # noqa: E731
        if self.instance is None and not attrs.get('particulier') and not (attrs.get('particulier_nom') or '').strip():
            raise serializers.ValidationError({'particulier_nom': 'Le nom du vendeur est obligatoire.'})
        bloc = attrs.get('bloc')
        if bloc is not None and (self.instance is None or self.instance.bloc_id != bloc.pk) and not bloc.actif:
            raise serializers.ValidationError({'bloc_id': 'Ce bloc est désactivé.'})

        montant = (Decimal(get('poids') or 0) * Decimal(get('prix_unitaire') or 0)).quantize(Decimal('0.01'))
        verse = attrs.get('montant_verse')
        if verse is not None and verse > montant:
            raise serializers.ValidationError({'montant_verse': f"Ne peut pas dépasser le montant de l'achat ({montant} FCFA)."})
        if self.instance is not None:
            deja_paye = montant_paye(self.instance)
            if montant < deja_paye:
                raise serializers.ValidationError({'poids': (
                    f"Le nouveau montant ({montant} FCFA) serait inférieur à ce qui a déjà été payé ({deja_paye} FCFA).")})
        return attrs

    def _vendeur(self, validated_data):
        vendeur = validated_data.pop('particulier', None)
        nom = (validated_data.pop('particulier_nom', '') or '').strip()
        telephone = validated_data.pop('particulier_telephone', None)
        if vendeur is None and nom:
            # Réutilise un vendeur déjà connu (même nom et même téléphone)
            vendeur = Particulier.objects.filter(nom__iexact=nom, telephone=telephone or '').first()
            if vendeur is None:
                vendeur = Particulier.objects.create(nom=nom, telephone=telephone or '')
        elif vendeur is not None and telephone and telephone != vendeur.telephone:
            vendeur.telephone = telephone
            vendeur.save(update_fields=['telephone'])
        return vendeur

    @transaction.atomic
    def create(self, validated_data):
        verse = validated_data.pop('montant_verse', ZERO) or ZERO
        type_paiement = validated_data.pop('type_paiement', PaiementAchat.TypePaiement.ESPECES)
        validated_data['particulier'] = self._vendeur(validated_data)
        achat = AchatParticulier(**validated_data)
        achat.save()
        if verse > 0:
            PaiementAchat.objects.create(achat=achat, montant=verse, date_paiement=achat.date_achat,
                                         type_paiement=type_paiement, reference=achat.reference)
        synchroniser_depense(achat)
        return achat

    @transaction.atomic
    def update(self, instance, validated_data):
        validated_data.pop('montant_verse', None)
        validated_data.pop('type_paiement', None)
        vendeur = self._vendeur(validated_data)
        if vendeur is not None:
            validated_data['particulier'] = vendeur
        achat = super().update(instance, validated_data)
        synchroniser_depense(achat)
        return achat


class PaiementAchatSerializer(serializers.ModelSerializer):
    achat_id = serializers.IntegerField(read_only=True)
    date = serializers.DateField(source='date_paiement', default=timezone.localdate)

    class Meta:
        model = PaiementAchat
        fields = ['id', 'achat_id', 'montant', 'date', 'type_paiement', 'reference', 'observation']

    def validate_montant(self, value):
        return v.strictement_positif(value, 'Le montant')

    def validate_date(self, value):
        return v.pas_dans_le_futur(value, 'La date de paiement')

    @transaction.atomic
    def create(self, validated_data):
        achat = AchatParticulier.objects.select_for_update().get(pk=self.context['achat'].pk)
        reste = achat.montant_total - montant_paye(achat)
        if validated_data['montant'] > reste:
            raise serializers.ValidationError({'montant': [f"Dépasse le reste à payer au vendeur ({reste} FCFA)."]})
        if validated_data['date_paiement'] < achat.date_achat:
            raise serializers.ValidationError({'date': ["Le paiement ne peut pas précéder la date de l'achat."]})
        from apps.finances.clotures import verifier_ouverte
        verifier_ouverte(validated_data['date_paiement'], achat.date_achat)
        paiement = PaiementAchat.objects.create(achat=achat, **validated_data)
        synchroniser_depense(achat)
        return paiement
