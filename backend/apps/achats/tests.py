"""Achats aux particuliers : dépense liée, règlements, unités, reçu PDF."""
from apps.core.testing import HIER, ApiTestCase
from apps.finances.models import Depense


class AchatsTests(ApiTestCase):
    def setUp(self):
        super().setUp()
        self.referentiel()

    def creer_achat(self, **valeurs):
        donnees = {'particulier_nom': 'Koné Awa', 'particulier_telephone': '07 55 44 33 22', 'designation': 'Régimes',
                   'poids': 200, 'prix_unitaire': 300, 'date_achat': HIER, 'bloc_id': self.bloc2['id'], 'montant_verse': 20000}
        donnees.update(valeurs)
        return self.post('achats-particuliers/', donnees)

    def test_achat_genere_une_depense_et_suit_les_paiements(self):
        achat = self.creer_achat()
        self.assertEqual((achat['reference'], achat['montant_total'], achat['statut'], achat['reste'], achat['unite_poids']),
                         ('ACH-0001', 60000.0, 'PARTIELLE', 40000.0, 'kg'))
        depense = Depense.objects.get(pk=achat['depense_id'])
        # Seule l'avance versée (20 000 sur 60 000) apparaît dans les dépenses
        self.assertEqual((depense.categorie.code, depense.montant_total, depense.statut, depense.bloc_id),
                         ('CAT-ACH', 20000, 'AVANCE', self.bloc2['id']))
        # Une dépense issue d'un achat ne se modifie pas directement
        self.patch(f'depenses/{depense.pk}/', {'designation': 'X'}, status=400)
        self.post(f"achats-particuliers/{achat['id']}/payer/", {'montant': 50000, 'type_paiement': 'ESPECES'}, status=400)
        payee = self.post(f"achats-particuliers/{achat['id']}/payer/", {'montant': 40000, 'type_paiement': 'ESPECES'})
        self.assertEqual(payee['statut'], 'PAYEE')
        depense.refresh_from_db()
        self.assertEqual((depense.statut, depense.montant_total), ('PAYEE', 60000))
        self.assertEqual(Depense.objects.get(pk=depense.pk).prix_unitaire, 60000)
        self.delete(f"achats-particuliers/{achat['id']}/")
        self.assertFalse(Depense.objects.filter(pk=depense.pk).exists())

    def test_la_depense_suit_les_versements_au_fur_et_a_mesure(self):
        # Rien de versé : pas de dépense
        achat = self.creer_achat(montant_verse=0)
        self.assertIsNone(achat['depense_id'])
        self.assertEqual(Depense.objects.count(), 0)
        premier = self.post(f"achats-particuliers/{achat['id']}/payer/", {'montant': 10000, 'type_paiement': 'ESPECES'})
        depense = Depense.objects.get(pk=premier['depense_id'])
        self.assertEqual((depense.montant_total, depense.statut), (10000, 'AVANCE'))
        self.post(f"achats-particuliers/{achat['id']}/payer/", {'montant': 20000, 'type_paiement': 'ESPECES'})
        depense.refresh_from_db()
        self.assertEqual((depense.montant_total, depense.statut), (30000, 'AVANCE'))
        self.post(f"achats-particuliers/{achat['id']}/payer/", {'montant': 30000, 'type_paiement': 'ESPECES'})
        depense.refresh_from_db()
        self.assertEqual((depense.montant_total, depense.statut), (60000, 'PAYEE'))
        # Le total des dépenses du mois ne compte que ce qui est versé
        kpis = self.get(f"tableau-de-bord/?periode={HIER[:7]}")['kpis']
        self.assertEqual((kpis['totalDepenses'], kpis['achatsParticuliers']), (60000.0, 60000.0))

    def test_unite_de_la_liste_et_modification(self):
        response = self.client.post('/api/v1/achats-particuliers/', {
            'particulier_nom': 'Yao', 'designation': 'Bois', 'poids': 1, 'prix_unitaire': 1, 'date_achat': HIER,
            'bloc_id': self.bloc['id'], 'unite_poids': 'tonnes'}, format='json')
        self.assertEqual(response.status_code, 400)
        achat = self.creer_achat(unite_poids='litre')
        modifie = self.patch(f"achats-particuliers/{achat['id']}/", {'poids': 250})
        self.assertEqual((modifie['unite_poids'], modifie['montant_total']), ('litre', 75000.0))
        self.assertEqual(Depense.objects.get(pk=achat['depense_id']).montant_total, 20000)  # seule l'avance versée est comptée

    def test_recu_d_achat_pdf(self):
        achat = self.creer_achat()
        response = self.client.get(f"/api/v1/achats-particuliers/{achat['id']}/recu/")
        self.assertEqual((response.status_code, response['Content-Type']), (200, 'application/pdf'))
        self.assertIn('filename="Recu_ACH-0001.pdf"', response['Content-Disposition'])
        self.assertTrue(response.content.startswith(b'%PDF'))
