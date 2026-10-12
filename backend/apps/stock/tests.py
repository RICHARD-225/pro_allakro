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

    def test_modifier_et_supprimer_un_produit(self):
        produit = self.post('produits/', {'nom': 'Fongicide', 'unite': 'L', 'stock_minimum': 5, 'prix_unitaire': 100})
        self.assertEqual(self.patch(f"produits/{produit['id']}/", {'prix_unitaire': 150})['valeur_stock'], 0.0)
        self.delete(f"produits/{produit['id']}/")
