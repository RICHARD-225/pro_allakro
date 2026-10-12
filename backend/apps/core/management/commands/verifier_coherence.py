"""
Contrôle de cohérence des chiffres de la base : chaque règle financière est recalculée indépendamment (sommes ORM)
et comparée aux valeurs enregistrées et à celles du tableau de bord. Échoue (code de sortie 1) à la première série d'écarts.

    python manage.py verifier_coherence

Règles contrôlées : montant d'un travail = quantité × prix ; rémunération = montant du travail ; net = brut − ponction ;
payé ≤ net ; un paiement valide a UNE dépense de même montant et de même date, un paiement annulé n'en a aucune ;
statut « Avance » seulement pour une avance dont la rémunération n'est pas soldée ; un travail annulé n'a ni paiement
valide ni dépense ; achats = dépense unique du montant versé ; stock = somme des mouvements et jamais négatif ;
tableau de bord = sommes recalculées, répartitions = total.
"""
from decimal import Decimal

from django.core.management.base import BaseCommand, CommandError
from django.db.models import Sum
from rest_framework.test import APIRequestFactory, force_authenticate

from apps.accounts.models import Utilisateur
from apps.achats.models import AchatParticulier
from apps.exploitation.models import Travail
from apps.finances.models import CategorieDepense, Depense, PaiementSalaire, Salaire
from apps.finances.tableau_de_bord import TableauDeBordView, periodes_disponibles
from apps.core.utils import parse_periode
from apps.stock.models import MouvementStock, Produit

ZERO = Decimal('0')
CENT = Decimal('0.01')


def somme(queryset, champ):
    return queryset.aggregate(total=Sum(champ))['total'] or ZERO


class Command(BaseCommand):
    help = "Vérifie la cohérence des chiffres (travaux, rémunérations, paiements, dépenses, achats, stock, tableau de bord)."

    def handle(self, *args, **options):
        self.erreurs = []
        self.controles = 0
        self.verifier_travaux()
        self.verifier_remunerations()
        self.verifier_paiements()
        self.verifier_depenses()
        self.verifier_achats()
        self.verifier_stock()
        self.verifier_clotures()
        self.verifier_tableau_de_bord()
        if self.erreurs:
            for erreur in self.erreurs:
                self.stdout.write(self.style.ERROR(f'  ✗ {erreur}'))
            raise CommandError(f'{len(self.erreurs)} incohérence(s) sur {self.controles} contrôles.')
        self.stdout.write(self.style.SUCCESS(f'Cohérence vérifiée : {self.controles} contrôles, aucune incohérence.'))

    # ------------------------------------------------------------------
    def verifie(self, condition, message):
        self.controles += 1
        if not condition:
            self.erreurs.append(message)

    def egal(self, a, b, message):
        self.verifie(Decimal(str(a)).quantize(CENT) == Decimal(str(b)).quantize(CENT), f'{message} : {a} ≠ {b}')

    # ------------------------------------------------------------------
    def verifier_travaux(self):
        for travail in Travail.objects.select_related('type_travail', 'bloc'):
            nom = f'Travail #{travail.pk} ({travail.activite_libelle} {travail.bloc.code})'
            self.egal(travail.montant_total, (travail.quantite * travail.prix_unitaire).quantize(CENT), f'{nom} : montant ≠ quantité × prix')
            if travail.statut == Travail.Statut.ANNULE:
                valides = PaiementSalaire.objects.filter(salaire__travail=travail, annule=False).count()
                self.verifie(valides == 0, f'{nom} annulé mais {valides} paiement(s) valide(s)')

    def verifier_remunerations(self):
        for travail in Travail.objects.select_related('responsable'):
            salaire = Salaire.objects.filter(travail=travail).first()
            if travail.responsable_id and travail.montant_total > 0:
                self.verifie(salaire is not None, f'Travail #{travail.pk} sans rémunération')
                if salaire is not None:
                    self.egal(salaire.montant_brut, travail.montant_total, f'Rémunération du travail #{travail.pk} ≠ montant du travail')
        for salaire in Salaire.objects.all():
            nom = f'Rémunération #{salaire.pk}'
            self.egal(salaire.montant_net, salaire.montant_brut - salaire.montant_ponction, f'{nom} : net ≠ brut − ponction')
            paye = somme(PaiementSalaire.objects.filter(salaire=salaire, annule=False), 'montant')
            self.verifie(paye <= salaire.montant_net, f'{nom} : payé ({paye}) > net ({salaire.montant_net})')

    def verifier_paiements(self):
        categorie_salaires = CategorieDepense.objects.filter(code=CategorieDepense.CODE_SALAIRES).first()
        for paiement in PaiementSalaire.objects.select_related('depense', 'salaire'):
            nom = f'Paiement {paiement.numero}'
            if paiement.annule:
                self.verifie(paiement.depense_id is None, f'{nom} annulé mais sa dépense existe encore')
                continue
            depense = paiement.depense
            self.verifie(depense is not None, f'{nom} sans dépense')
            if depense is None:
                continue
            self.egal(depense.montant_total, paiement.montant, f'{nom} : dépense ≠ paiement')
            self.verifie(depense.date_depense == paiement.date_paiement, f'{nom} : date de la dépense ≠ date du paiement')
            self.verifie(categorie_salaires is not None and depense.categorie_id == categorie_salaires.pk, f'{nom} : mauvaise catégorie')
            reste = paiement.salaire.montant_net - somme(PaiementSalaire.objects.filter(salaire=paiement.salaire, annule=False), 'montant')
            attendu = Depense.Statut.AVANCE if paiement.est_avance and reste > 0 else Depense.Statut.PAYEE
            self.verifie(depense.statut == attendu, f'{nom} : statut {depense.statut}, attendu {attendu}')
        if categorie_salaires is not None:
            orphelines = Depense.objects.filter(categorie=categorie_salaires, paiement_salaire__isnull=True).count()
            self.verifie(orphelines == 0, f'{orphelines} dépense(s) de salaire sans paiement')

    def verifier_depenses(self):
        for depense in Depense.objects.select_related('categorie'):
            if depense.categorie.code in (CategorieDepense.CODE_SALAIRES, CategorieDepense.CODE_ACHAT_PARTICULIERS):
                continue
            self.verifie(depense.statut == Depense.Statut.PAYEE, f'Dépense #{depense.pk} saisie à la main : statut {depense.statut}, attendu PAYEE')
            self.verifie(depense.montant_total > 0, f'Dépense #{depense.pk} : montant nul')

    def verifier_achats(self):
        for achat in AchatParticulier.objects.select_related('depense'):
            nom = f'Achat {achat.reference}'
            self.egal(achat.montant_total, (achat.poids * achat.prix_unitaire).quantize(CENT), f'{nom} : montant ≠ poids × prix')
            paye = somme(achat.paiements.all(), 'montant')
            self.verifie(paye <= achat.montant_total, f'{nom} : versé ({paye}) > montant ({achat.montant_total})')
            depense = achat.depense
            if paye <= 0:
                self.verifie(depense is None, f"{nom} : rien n'a été versé mais une dépense existe")
                continue
            # La dépense de l'achat ne porte que ce qui a été versé au vendeur
            self.verifie(depense is not None, f'{nom} sans dépense alors que {paye} FCFA ont été versés')
            if depense is not None:
                self.egal(depense.montant_total, paye, f'{nom} : dépense ≠ montant versé')
                attendu = Depense.Statut.PAYEE if paye >= achat.montant_total else Depense.Statut.AVANCE
                self.verifie(depense.statut == attendu, f'{nom} : statut de la dépense {depense.statut}, attendu {attendu}')

        orphelines = Depense.objects.filter(categorie__code=CategorieDepense.CODE_ACHAT_PARTICULIERS, achat_particulier__isnull=True).count()
        self.verifie(orphelines == 0, f"{orphelines} dépense(s) d'achat sans achat")

    def verifier_clotures(self):
        """Un mois clôturé doit toujours donner les chiffres figés à la clôture (aucune écriture n'a pu le modifier)."""
        from apps.finances.clotures import resume_periode
        from apps.finances.models import ClotureMensuelle
        cles = ('totalDepenses', 'depensesPayees', 'depensesAvances', 'remunerationDuee', 'remunerationPayee', 'resteAPayer',
                'nbTravaux', 'montantTravaux', 'achatsParticuliers', 'nbAchats')
        for cloture in ClotureMensuelle.objects.filter(cloturee=True):
            actuel = resume_periode(cloture.periode)['kpis']
            for cle in cles:
                self.egal(actuel[cle], cloture.resume['kpis'][cle], f'Mois clôturé {cloture.periode} : {cle} différent de la clôture')

    def verifier_stock(self):
        for produit in Produit.objects.avec_stock():
            attendu = sum((m.quantite_signee for m in MouvementStock.objects.filter(produit=produit)), ZERO)
            self.egal(produit.stock_calcule, attendu, f'Stock du produit {produit.nom} ≠ somme des mouvements')
            self.verifie(produit.stock_calcule >= 0, f'Stock négatif pour {produit.nom} : {produit.stock_calcule}')

    def verifier_tableau_de_bord(self):
        compte = Utilisateur.objects.select_related('role').order_by('id').first()
        if compte is None:
            return
        fabrique = APIRequestFactory()
        for periode in periodes_disponibles():
            requete = fabrique.get('/api/tableau-de-bord/', {'periode': periode})
            force_authenticate(requete, user=compte)
            reponse = TableauDeBordView.as_view()(requete)
            self.verifie(reponse.status_code == 200, f'Tableau de bord {periode} : HTTP {reponse.status_code}')
            if reponse.status_code != 200:
                continue
            donnees = reponse.data
            kpis = donnees['kpis']
            debut, fin = parse_periode(periode)
            nom = f'Tableau de bord {periode}'

            depenses = Depense.objects.filter(date_depense__range=(debut, fin))
            total = somme(depenses, 'montant_total')
            self.egal(kpis['totalDepenses'], total, f'{nom} : total des dépenses')
            self.egal(kpis['depensesPayees'], somme(depenses.filter(statut='PAYEE'), 'montant_total'), f'{nom} : dépenses payées')
            self.egal(kpis['depensesAvances'], somme(depenses.filter(statut='AVANCE'), 'montant_total'), f'{nom} : avances')
            for cle in ('depensesParCategorie', 'depensesParBloc', 'depensesParCampement', 'depensesParActivite'):
                self.egal(sum((Decimal(str(ligne['value'])) for ligne in donnees[cle]), ZERO), total, f'{nom} : {cle} ≠ total des dépenses')

            salaires = Salaire.objects.filter(date_debut__range=(debut, fin), annulee=False).exclude(travail__statut='ANNULE')
            due = somme(salaires, 'montant_net')
            payee = somme(PaiementSalaire.objects.filter(salaire__in=salaires, annule=False), 'montant')
            self.egal(kpis['remunerationDuee'], due, f'{nom} : rémunération due')
            self.egal(kpis['remunerationPayee'], payee, f'{nom} : rémunération payée')
            self.egal(kpis['resteAPayer'], max(due - payee, ZERO), f'{nom} : reste à payer')

            travaux = Travail.objects.exclude(statut='ANNULE').filter(date_travail__range=(debut, fin))
            self.verifie(kpis['nbTravaux'] == travaux.count(), f'{nom} : nombre de travaux')
            self.egal(kpis['montantTravaux'], somme(travaux, 'montant_total'), f'{nom} : montant des travaux')
            achats = AchatParticulier.objects.filter(date_achat__range=(debut, fin))
            self.egal(kpis['achatsParticuliers'], somme(achats, 'montant_total'), f'{nom} : achats aux particuliers')

        produits = Produit.objects.filter(actif=True).avec_stock()
        self.egal(sum((p.stock_calcule * p.prix_unitaire for p in produits), ZERO),
                  Decimal(str(self._kpi_stock(fabrique, compte))), 'Valeur du stock du tableau de bord')

    def _kpi_stock(self, fabrique, compte):
        requete = fabrique.get('/api/tableau-de-bord/')
        force_authenticate(requete, user=compte)
        return TableauDeBordView.as_view()(requete).data['kpis']['valeurStock']
