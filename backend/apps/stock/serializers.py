from decimal import Decimal

from django.db import transaction
from django.utils import timezone
from rest_framework import serializers

from apps.core import validators as v
from apps.core.models import Bloc

from .models import MouvementStock, Produit


class ProduitSerializer(serializers.ModelSerializer):
    # Quantité déjà en magasin à la création du produit : elle devient une entrée « Stock initial » (le stock n'est jamais saisi
    # directement, il se calcule à partir des mouvements). Ignorée à la modification : le stock évolue alors par mouvements.
    quantite_initiale = serializers.DecimalField(max_digits=15, decimal_places=3, write_only=True, required=False, allow_null=True,
                                                 min_value=Decimal('0'), error_messages={'min_value': 'La quantité ne peut pas être négative.',
                                                                                         'invalid': 'Quantité invalide.'})

    class Meta:
        model = Produit
        fields = ['id', 'code', 'nom', 'categorie', 'unite', 'prix_unitaire', 'stock_minimum', 'actif', 'description', 'quantite_initiale']
        read_only_fields = ['code']

    @transaction.atomic
    def create(self, validated_data):
        quantite = validated_data.pop('quantite_initiale', None)
        produit = super().create(validated_data)
        if quantite and quantite > 0:
            MouvementStock.objects.create(
                produit=produit, type_mouvement=MouvementStock.TypeMouvement.ENTREE, quantite=quantite, prix_unitaire=produit.prix_unitaire,
                date_mouvement=timezone.localdate(), motif='Stock initial')
        return produit

    def update(self, instance, validated_data):
        validated_data.pop('quantite_initiale', None)
        return super().update(instance, validated_data)

    def to_representation(self, instance):
        data = super().to_representation(instance)
        stock = getattr(instance, 'stock_calcule', None)
        if stock is None:
            stock = instance.stock_actuel()
        data.update({
            'stock_calcule': float(stock),
            'status': 'low' if stock < instance.stock_minimum else 'ok',
            'valeur_stock': float(stock * instance.prix_unitaire),
            # Annoncé dans la confirmation de suppression : le produit part avec ses mouvements
            'nb_mouvements': getattr(instance, 'nb_mouvements', None) if hasattr(instance, 'nb_mouvements') else instance.mouvements.count(),
        })
        return data

    def validate_nom(self, value):
        value = v.texte_obligatoire(value, 'Le nom')
        return v.unique_insensible(Produit.objects, 'nom', value, self.instance, 'Un produit porte déjà ce nom.')

    def validate_unite(self, value):
        return v.texte_obligatoire(value, "L'unité")

    def validate_stock_minimum(self, value):
        return v.positif_ou_nul(value, 'Le seuil minimum')

    def validate_prix_unitaire(self, value):
        return v.positif_ou_nul(value, 'Le prix unitaire')


class MouvementStockSerializer(serializers.ModelSerializer):
    produit_id = v.RelatedField(source='produit', queryset=Produit.objects.all())
    produit_nom = serializers.CharField(source='produit.nom', read_only=True)
    produit_code = serializers.CharField(source='produit.code', read_only=True)
    unite = serializers.CharField(source='produit.unite', read_only=True)
    bloc_id = v.RelatedField(source='bloc', queryset=Bloc.objects.select_related('campement'))
    bloc_code = serializers.CharField(source='bloc.code', read_only=True, default=None)
    campement_id = serializers.IntegerField(source='bloc.campement_id', read_only=True, default=None)
    campement_nom = serializers.CharField(source='bloc.campement.nom', read_only=True, default=None)
    date = serializers.DateField(source='date_mouvement', default=timezone.localdate)

    class Meta:
        model = MouvementStock
        fields = ['id', 'produit_id', 'produit_nom', 'produit_code', 'unite', 'type_mouvement', 'quantite',
                  'prix_unitaire', 'date', 'motif', 'reference', 'observation', 'bloc_id', 'bloc_code',
                  'campement_id', 'campement_nom']
        extra_kwargs = {'prix_unitaire': {'required': False}}

    def validate_date(self, value):
        return v.pas_dans_le_futur(value, 'La date du mouvement')

    def validate_motif(self, value):
        return v.texte_obligatoire(value, 'Le motif')

    def validate(self, attrs):
        produit, bloc, quantite = attrs['produit'], attrs['bloc'], attrs['quantite']
        v.actif(produit, 'Ce produit')
        if not bloc.actif:
            raise serializers.ValidationError({'bloc_id': 'Ce bloc est désactivé.'})
        if attrs['type_mouvement'] == MouvementStock.TypeMouvement.AJUSTEMENT:
            if quantite == 0:
                raise serializers.ValidationError({'quantite': "La quantité d'un ajustement ne peut pas être nulle."})
        elif quantite <= 0:
            raise serializers.ValidationError({'quantite': 'La quantité doit être supérieure à 0.'})
        if not attrs.get('prix_unitaire'):
            attrs['prix_unitaire'] = produit.prix_unitaire
        return attrs

    @transaction.atomic
    def create(self, validated_data):
        # Verrou sur le produit : deux sorties simultanées ne peuvent pas rendre le stock négatif
        produit = Produit.objects.select_for_update().get(pk=validated_data['produit'].pk)
        stock = produit.stock_actuel()
        variation = -validated_data['quantite'] if validated_data['type_mouvement'] == 'SORTIE' else validated_data['quantite']
        if stock + variation < 0:
            raise serializers.ValidationError({'quantite': [
                f"Stock insuffisant : {stock.normalize():f} {produit.unite} disponible(s)."]})
        validated_data['produit'] = produit
        mouvement = super().create(validated_data)
        from apps.accounts.notifications import alerte_stock
        alerte_stock(produit, stock, stock + variation, getattr(self.context.get('request'), 'user', None))
        return mouvement
