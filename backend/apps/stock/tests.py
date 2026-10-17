"""Stock : calcul à partir des mouvements, sorties bornées, modification et suppression."""
from apps.core.testing import HIER, ApiTestCase


class StockTests(ApiTestCase):
    def setUp(self):
        super().setUp()
        self.referentiel()

    def test_stock_calcule_et_sortie_bornee(self):
        produit = self.post('produits/', {'nom': 'Herbicide', 'unite': 'L', 'stock_minimum': 50, 'prix_unitaire': 100})
        self.assertEqual(produit['code'], 'PRD-001')
        mvt = {'produit_id': produit['id'], 'bloc_id': self.bloc['id'], 'date': HIER, 'motif': 'Test'}
        entree = self.post('mouvements-stock/', {**mvt, 'type_mouvement': 'ENTREE', 'quantite': 100})
        self.post('mouvements-stock/', {**mvt, 'type_mouvement': 'SORTIE', 'quantite': 70})
        errors = self.post('mouvements-stock/', {**mvt, 'type_mouvement': 'SORTIE', 'quantite': 31}, status=400)
        self.assertIn('Stock insuffisant', errors['quantite'][0])
        produit = self.get(f"produits/{produit['id']}/")
        self.assertEqual((produit['stock_calcule'], produit['status']), (30.0, 'low'))
        # Supprimer l'entrée est permis après confirmation (voir AnnulationEtRepartitionTests pour le détail)
        self.delete(f"mouvements-stock/{entree['id']}/")

    def test_quantite_en_stock_a_la_creation_du_produit(self):
        """La quantité saisie à la création devient une entrée « Stock initial » : le stock reste calculé à partir des mouvements."""
        base = {'nom': 'Engrais NPK', 'unite': 'sac', 'stock_minimum': 10, 'prix_unitaire': 500}
        produit = self.post('produits/', {**base, 'quantite_initiale': 40})
        self.assertEqual((produit['stock_calcule'], produit['status']), (40.0, 'ok'))
        self.assertNotIn('quantite_initiale', produit)  # champ d'écriture seulement
        mouvements = [m for m in self.get('mouvements-stock/') if m['produit_id'] == produit['id']]
        self.assertEqual(len(mouvements), 1)
        self.assertEqual((mouvements[0]['type_mouvement'], float(mouvements[0]['quantite']), mouvements[0]['motif']), ('ENTREE', 40.0, 'Stock initial'))
        self.assertIsNone(mouvements[0]['bloc_id'])
        # Sans quantité (ou à 0) : le stock démarre à 0, aucun mouvement
        vide = self.post('produits/', {**base, 'nom': 'Engrais vide'})
        zero = self.post('produits/', {**base, 'nom': 'Engrais zéro', 'quantite_initiale': 0})
        self.assertEqual((vide['stock_calcule'], zero['stock_calcule']), (0.0, 0.0))
        self.assertEqual(len([m for m in self.get('mouvements-stock/') if m['produit_id'] in (vide['id'], zero['id'])]), 0)
        # Quantité négative refusée ; à la modification la quantité est ignorée (le stock évolue par mouvements)
        self.assertIn('quantite_initiale', self.post('produits/', {**base, 'nom': 'Engrais négatif', 'quantite_initiale': -5}, status=400))
        modifie = self.patch(f"produits/{produit['id']}/", {'quantite_initiale': 999, 'stock_minimum': 20})
        self.assertEqual(modifie['stock_calcule'], 40.0)
        # Le produit se vend ensuite normalement : sortie bornée par le stock initial
        mvt = {'produit_id': produit['id'], 'bloc_id': self.bloc['id'], 'date': HIER, 'motif': 'Épandage', 'type_mouvement': 'SORTIE'}
        self.assertIn('Stock insuffisant', self.post('mouvements-stock/', {**mvt, 'quantite': 41}, status=400)['quantite'][0])
        self.post('mouvements-stock/', {**mvt, 'quantite': 15})
        self.assertEqual(self.get(f"produits/{produit['id']}/")['stock_calcule'], 25.0)

    def test_modifier_et_supprimer_un_produit(self):
        produit = self.post('produits/', {'nom': 'Fongicide', 'unite': 'L', 'stock_minimum': 5, 'prix_unitaire': 100})
        self.assertEqual(self.patch(f"produits/{produit['id']}/", {'prix_unitaire': 150})['valeur_stock'], 0.0)
        self.delete(f"produits/{produit['id']}/")
