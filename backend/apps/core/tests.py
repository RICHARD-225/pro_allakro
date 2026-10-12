"""Exploitation (plantations, campements, blocs) et personnel (personnes, fonctions) : validations et unicité en base."""
from django.db import IntegrityError, transaction

from apps.core.models import Fonction, Personne
from apps.core.testing import ApiTestCase


class ExploitationTests(ApiTestCase):
    def test_codes_automatiques(self):
        self.referentiel()
        self.assertEqual([self.bloc['code'], self.bloc2['code']], ['BLC-001', 'BLC-002'])
        self.assertEqual(self.personnes[0]['matricule'], 'MAT-0003')  # 2 personnes déjà créées pour les comptes
        self.assertEqual(self.get('blocs/prochain-code/')['code'], 'BLC-003')

    def test_superficies_coherentes(self):
        self.referentiel()
        errors = self.post('campements/', {'nom': 'Camp B', 'plantation_id': self.plantation['id'], 'superficie': 50}, status=400)
        self.assertIn('superficie', errors)
        errors = self.post('blocs/', {'nom': 'A3', 'campement_id': self.campement['id'], 'superficie': 30,
                                      'nombre_plantes': 10}, status=400)
        self.assertIn('superficie', errors)

    def test_nom_de_bloc_unique_dans_le_campement(self):
        self.referentiel()
        errors = self.post('blocs/', {'nom': 'a1', 'campement_id': self.campement['id'], 'nombre_plantes': 1}, status=400)
        self.assertIn('nom', errors)

    def test_nombre_de_plantes_obligatoire_valide_et_modifiable(self):
        self.referentiel()
        base = {'nom': 'A3', 'campement_id': self.campement['id'], 'superficie': 10}
        self.assertIn('nombre_plantes', self.post('blocs/', base, status=400))
        self.assertIn('nombre_plantes', self.post('blocs/', {**base, 'nombre_plantes': -5}, status=400))
        self.assertIn('nombre_plantes', self.post('blocs/', {**base, 'nombre_plantes': 'beaucoup'}, status=400))
        bloc = self.post('blocs/', {**base, 'nombre_plantes': 1430})
        self.assertEqual(bloc['nombre_plantes'], 1430)
        self.assertEqual(self.patch(f"blocs/{bloc['id']}/", {'nombre_plantes': 1500})['nombre_plantes'], 1500)
        self.assertEqual(next(b for b in self.get('blocs/') if b['id'] == bloc['id'])['nombre_plantes'], 1500)

    def test_modifier_et_supprimer_une_plantation(self):
        plantation = self.post('plantations/', {'nom': 'Sud', 'superficie': 10})
        self.assertEqual(self.patch(f"plantations/{plantation['id']}/", {'nom': 'Sud-Ouest'})['nom'], 'Sud-Ouest')
        self.login(self.superviseur.username)
        self.delete(f"plantations/{plantation['id']}/", status=403)
        self.login(self.admin.username)
        self.delete(f"plantations/{plantation['id']}/")
        # Une plantation utilisée par un campement ne se supprime pas (message clair, pas d'erreur serveur)
        self.referentiel()
        response = self.delete(f"plantations/{self.plantation['id']}/", status=400)
        self.assertIn('Suppression impossible', response.json()['detail'])


class PersonnesTests(ApiTestCase):
    def setUp(self):
        super().setUp()
        self.ids = self.referentiel()

    def test_bloc_obligatoire_et_campement_deduit(self):
        errors = self.post('personnes/', {'nom': 'Sans', 'prenom': 'Bloc', 'fonction_id': self.fonction.pk}, status=400)
        self.assertIn('bloc_id', errors)
        personne = self.post('personnes/', {'nom': 'Avec', 'prenom': 'Bloc', 'fonction_id': self.fonction.pk,
                                            'bloc_id': self.bloc2['id']})
        self.assertEqual((personne['bloc_code'], personne['campement_id'], personne['plantation_nom']),
                         ('BLC-002', self.campement['id'], 'Nord'))
        self.assertEqual(self.patch(f"personnes/{personne['id']}/", {'bloc_id': self.bloc['id']})['bloc_code'], 'BLC-001')

    def test_une_personne_n_existe_qu_une_fois(self):
        # Même nom et prénom, quelles que soient les majuscules et les espaces
        errors = self.post('personnes/', {'nom': ' NOM0 ', 'prenom': 'p', 'fonction_id': self.fonction.pk,
                                          'bloc_id': self.bloc['id']}, status=400)
        self.assertIn('existe déjà', errors['nom'][0])
        # Même numéro écrit autrement
        errors = self.post('personnes/', {'nom': 'Autre', 'prenom': 'Personne', 'telephone': '0700000000',
                                          'fonction_id': self.fonction.pk, 'bloc_id': self.bloc['id']}, status=400)
        self.assertIn('telephone', errors)
        # La base de données elle-même refuse les doublons (dernier rempart)
        with self.assertRaises(IntegrityError), transaction.atomic():
            Personne.objects.create(nom='nom0', prenom='P', bloc_id=self.bloc['id'])
        with self.assertRaises(IntegrityError), transaction.atomic():
            Personne.objects.create(nom='Autre', prenom='Personne', telephone='07-00-00-00-01', bloc_id=self.bloc['id'])

    def test_fonction_saisie_librement_sans_doublon(self):
        fonction = self.post('fonctions/', {'libelle': 'Chef de chantier'})
        for variante in ('chef de chantier', 'CHEF DE CHANTIER', 'Chef  de   chantier'):
            response = self.client.post('/api/v1/fonctions/', {'libelle': variante}, format='json')
            self.assertEqual((response.status_code, response.json()['id']), (200, fonction['id']))
        personne = self.post('personnes/', {'nom': 'Kouadio', 'prenom': 'Eric', 'fonction_libelle': 'CHEF  DE CHANTIER',
                                            'bloc_id': self.bloc['id']})
        self.assertEqual((personne['fonction_id'], personne['fonction_libelle']), (fonction['id'], 'Chef de chantier'))
        nouvelle = self.post('personnes/', {'nom': 'Yapo', 'prenom': 'Luc', 'fonction_libelle': 'gardien de nuit',
                                            'bloc_id': self.bloc['id']})
        self.assertEqual(nouvelle['fonction_libelle'], 'Gardien de nuit')
        self.assertEqual(Fonction.objects.filter(libelle__iexact='chef de chantier').count(), 1)
        with self.assertRaises(IntegrityError), transaction.atomic():
            Fonction.objects.create(libelle='CHEF DE CHANTIER')

    def test_activation_desactivation_et_historique(self):
        personne_id = self.ids[1]
        self.assertFalse(self.patch(f'personnes/{personne_id}/', {'actif': False})['actif'])
        self.assertEqual([p['id'] for p in self.get('personnes/?actif=false') if p['id'] == personne_id], [personne_id])
        self.assertTrue(self.patch(f'personnes/{personne_id}/', {'actif': True})['actif'])
        historique = self.get(f'personnes/{personne_id}/historique/')
        self.assertEqual(set(historique), {'travaux', 'remunerations', 'paiements', 'total_recu'})

    def test_modifier_et_supprimer_une_personne(self):
        personne = self.post('personnes/', {'nom': 'Temp', 'prenom': 'Orary', 'fonction_id': self.fonction.pk,
                                            'bloc_id': self.bloc['id']})
        self.assertEqual(self.patch(f"personnes/{personne['id']}/", {'telephone': '05 11 22 33 44'})['telephone'], '05 11 22 33 44')
        self.delete(f"personnes/{personne['id']}/")
        # Une personne qui a travaillé ne se supprime pas : on la désactive
        self.creer_travail([self.ids[0]])
        response = self.delete(f'personnes/{self.ids[0]}/', status=400)
        self.assertIn('Désactivez-le', response.json()['detail'])
