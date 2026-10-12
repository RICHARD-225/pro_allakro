"""Base commune des tests de l'API (base de test PostgreSQL isolée, créée par les migrations)."""
import html
import io
import re
import zipfile
from datetime import timedelta

from django.contrib.auth.hashers import make_password
from django.core.cache import cache
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import RoleUtilisateur, Utilisateur
from apps.core.models import Fonction, Personne
from apps.exploitation.models import TypeTravail

AUJOURDHUI = timezone.localdate()
DEMAIN = (AUJOURDHUI + timedelta(days=1)).isoformat()
HIER = (AUJOURDHUI - timedelta(days=1)).isoformat()
XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'


def jour(decalage):
    return (AUJOURDHUI + timedelta(days=decalage)).isoformat()


def lire_classeur(contenu):
    """Noms des feuilles, textes partagés et XML de chaque feuille d'un fichier .xlsx."""
    with zipfile.ZipFile(io.BytesIO(contenu)) as archive:
        noms = re.findall(r'<sheet name="([^"]+)"', archive.read('xl/workbook.xml').decode('utf-8'))
        textes = html.unescape(archive.read('xl/sharedStrings.xml').decode('utf-8'))
        feuilles = {nom: archive.read(f'xl/worksheets/sheet{i}.xml').decode('utf-8') for i, nom in enumerate(noms, start=1)}
    return noms, textes, feuilles


class ApiTestCase(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.fonction = Fonction.objects.create(libelle='Ouvrier agricole')
        boss = RoleUtilisateur.objects.create(code='big_boss', libelle='Big Boss')
        sup = RoleUtilisateur.objects.create(code='superviseur', libelle='Superviseur')
        p_admin = Personne.objects.create(nom='Admin', prenom='Test')
        p_sup = Personne.objects.create(nom='Sup', prenom='Test')
        cls.admin = Utilisateur.objects.create(personne=p_admin, role=boss, username='admin@test.ci', password_hash=make_password('Motdepasse@1'))
        cls.superviseur = Utilisateur.objects.create(personne=p_sup, role=sup, username='sup@test.ci', password_hash=make_password('Motdepasse@1'))

    def setUp(self):
        cache.clear()  # compteurs de limitation du débit remis à zéro entre les tests
        self.client = APIClient()
        self.login(self.admin.username)

    def login(self, username, password='Motdepasse@1'):
        self.client.cookies.clear()
        return self.client.post('/api/v1/auth/login/', {'username': username, 'password': password}, format='json')

    def post(self, url, data, status=201):
        response = self.client.post(f'/api/v1/{url}', data, format='json')
        self.assertEqual(response.status_code, status, response.content.decode())
        return response.json()

    def patch(self, url, data, status=200):
        response = self.client.patch(f'/api/v1/{url}', data, format='json')
        self.assertEqual(response.status_code, status, response.content.decode())
        return response.json()

    def get(self, url):
        response = self.client.get(f'/api/v1/{url}')
        self.assertEqual(response.status_code, 200, response.content.decode())
        return response.json()

    def delete(self, url, status=204):
        response = self.client.delete(f'/api/v1/{url}')
        self.assertEqual(response.status_code, status, response.content.decode())
        return response

    @staticmethod
    def activite(libelle):
        return TypeTravail.objects.get(libelle=libelle).pk

    # Petit référentiel : 1 plantation, 1 campement, 2 blocs, 4 personnes affectées au bloc A1
    def referentiel(self):
        self.plantation = self.post('plantations/', {'nom': 'Nord', 'superficie': 100})
        self.campement = self.post('campements/', {'nom': 'Camp A', 'plantation_id': self.plantation['id'], 'superficie': 60})
        self.bloc = self.post('blocs/', {'nom': 'A1', 'campement_id': self.campement['id'], 'superficie': 20, 'nombre_plantes': 2860})
        self.bloc2 = self.post('blocs/', {'nom': 'A2', 'campement_id': self.campement['id'], 'superficie': 20, 'nombre_plantes': 2000})
        # Le superviseur de test est affecté au bloc A1 : son périmètre est le campement « Camp A »
        Personne.objects.filter(pk=self.superviseur.personne_id).update(bloc_id=self.bloc['id'], campement_id=self.campement['id'])
        self.personnes = [
            self.post('personnes/', {'nom': f'Nom{i}', 'prenom': 'P', 'telephone': f'07 00 00 00 0{i}',
                                     'fonction_id': self.fonction.pk, 'bloc_id': self.bloc['id']})
            for i in range(4)
        ]
        return [p['id'] for p in self.personnes]

    def creer_travail(self, personnes, chef=None, activite='OUVERTURES', status=201, **valeurs):
        donnees = {'type_travail_id': self.activite(activite), 'bloc_id': self.bloc['id'], 'date_travail': HIER,
                   'date_fin': HIER, 'quantite': 10, 'prix_unitaire': 1000, 'personnes_ids': personnes}
        if chef is not None:
            donnees['chef_id'] = chef
        donnees.update(valeurs)
        return self.post('travaux/', donnees, status=status)
