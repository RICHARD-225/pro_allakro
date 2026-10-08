"""Contenu du rapport : une feuille par thème, avec des valeurs typées (dates, montants, textes) calculées en base."""
from dataclasses import dataclass, field
from decimal import Decimal

from django.db.models import Count, DecimalField, Q, Sum, Value
from django.db.models.functions import Coalesce, TruncMonth
from django.utils import timezone

from apps.accounts.models import Journal
from apps.achats.models import AchatParticulier, PaiementAchat
from apps.core.models import Bloc
from apps.core.utils import parse_periode, periode_of, shift_periode
from apps.exploitation.models import Travail
from apps.stock.models import MouvementStock, Produit

from ..calculs import annoter_salaires, realise_prevision, statut_paiement
from ..models import Depense, PaiementSalaire, Prevision
from ..tableau_de_bord import MOIS_COURTS, periodes_disponibles

ZERO = Decimal('0')
ZERO_SQL = Value(ZERO, output_field=DecimalField(max_digits=15, decimal_places=2))
STATUTS_PAIEMENT = {'PAYEE': 'Payée', 'PARTIELLE': 'Partiellement payée', 'NON_PAYEE': 'Non payée'}


@dataclass
class Colonne:
    titre: str
    # texte, long (retour à la ligne), code, date, dateheure, mois, montant, quantite, entier, pourcentage, statut
    type: str = 'texte'
    # None, 'somme' ou ('ratio', titre du numérateur, titre du dénominateur)
    total: object = None


@dataclass
class Cellule:
    """Valeur affichée avec un autre type que celui de sa colonne (tableaux « libellé / valeur »)."""
    valeur: object
    type: str


@dataclass
class Tableau:
    colonnes: list
    lignes: list
    titre: str = ''
    note: str = ''
    libelle_total: str = 'Total'
    vide: str = 'Aucune donnée pour cette sélection.'
    saut_de_page: bool = False  # à l'impression, le tableau commence sur une nouvelle page


@dataclass
class Feuille:
    nom: str
    titre: str
    description: str
    tableaux: list
    theme: str
    etat_actuel: bool = False          # état à la date du jour (stock) : la période ne s'applique pas
    perimetre_applicable: bool = True  # le journal et le stock couvrent toute l'exploitation

    @property
    def nb_lignes(self):
        return sum(len(t.lignes) for t in self.tableaux)


@dataclass
class Indicateur:
    libelle: str
    valeur: object
    type: str  # montant, entier, quantite, pourcentage, evolution


@dataclass
class Synthese:
    groupes: list = field(default_factory=list)       # [(thème, [Indicateur…])]
    categories: list = field(default_factory=list)    # [(catégorie, montant)]
    evolution: list = field(default_factory=list)     # [(libellé du mois, montant)]


def part(montant, total):
    return (montant / total) if total else None


def somme(queryset, champ):
    return queryset.aggregate(total=Sum(champ))['total'] or ZERO


# --- Feuilles de détail ---

def feuille_depenses(p):
    depenses = p.sur_periode(p.filtrer(
        Depense.objects.select_related('categorie', 'campement', 'bloc', 'achat_particulier')), 'date_depense')
    lignes = []
    for d in depenses.order_by('date_depense', 'id'):
        achat = getattr(d, 'achat_particulier', None)
        lignes.append([
            d.date_depense, d.designation, d.categorie.libelle, d.campement.nom, d.bloc.code if d.bloc else '',
            d.quantite, d.unite, d.prix_unitaire, d.montant_total, STATUTS_PAIEMENT.get(d.statut, d.statut),
            f"Achat {achat.reference}" if achat else 'Saisie directe',
        ])
    colonnes = [
        Colonne('Date', 'date'), Colonne('Désignation', 'long'), Colonne('Catégorie'), Colonne('Campement'),
        Colonne('Bloc', 'code'), Colonne('Quantité', 'quantite'), Colonne('Unité', 'code'),
        Colonne('Prix unitaire', 'montant'), Colonne('Montant (FCFA)', 'montant', 'somme'),
        Colonne('Statut', 'statut'), Colonne('Origine'),
    ]
    return Feuille('Dépenses', 'Dépenses', "Toutes les dépenses, y compris celles créées par les achats aux particuliers.",
                   [Tableau(colonnes, lignes)], 'finances')


def feuille_achats(p):
    achats = p.sur_periode(p.filtrer(
        AchatParticulier.objects.select_related('particulier', 'campement', 'bloc')
        .annotate(paye=Coalesce(Sum('paiements__montant'), ZERO_SQL))), 'date_achat')
    lignes = []
    for a in achats.order_by('date_achat', 'id'):
        lignes.append([
            a.reference, a.date_achat, str(a.particulier), a.particulier.telephone, a.designation, a.poids,
            a.unite_poids, a.prix_unitaire, a.montant_total, a.paye, max(a.montant_total - a.paye, ZERO),
            STATUTS_PAIEMENT[statut_paiement(a.montant_total, a.paye)], a.campement.nom, a.bloc.code if a.bloc else '',
        ])
    colonnes = [
        Colonne('Référence', 'code'), Colonne('Date', 'date'), Colonne('Vendeur'), Colonne('Téléphone', 'code'),
        Colonne('Produit', 'long'), Colonne('Poids / Qté', 'quantite'), Colonne('Unité', 'code'),
        Colonne('Prix unitaire', 'montant'), Colonne('Montant (FCFA)', 'montant', 'somme'),
        Colonne('Payé', 'montant', 'somme'), Colonne('Reste à payer', 'montant', 'somme'),
        Colonne('Statut', 'statut'), Colonne('Campement'), Colonne('Bloc', 'code'),
    ]
    return Feuille('Achats particuliers', 'Achats aux particuliers',
                   "Produits achetés à des particuliers : montant = poids × prix unitaire, et règlement des vendeurs.",
                   [Tableau(colonnes, lignes)], 'finances')


def feuille_previsions(p):
    previsions = p.sur_periode(p.filtrer(Prevision.objects.select_related('campement', 'bloc', 'categorie')),
                               'periode_debut').order_by('periode_debut', 'campement__nom', 'categorie__libelle')
    lignes = []
    for prevision in previsions:
        realise = realise_prevision(prevision)
        lignes.append([
            prevision.periode_debut, prevision.campement.nom, prevision.bloc.code if prevision.bloc else 'Tout le campement',
            prevision.categorie.libelle if prevision.categorie else 'Toutes catégories', prevision.designation,
            prevision.montant_prevu, realise, realise - prevision.montant_prevu, part(realise, prevision.montant_prevu),
        ])
    colonnes = [
        Colonne('Période', 'mois'), Colonne('Campement'), Colonne('Bloc', 'code'), Colonne('Catégorie'),
        Colonne('Désignation', 'long'), Colonne('Prévu (FCFA)', 'montant', 'somme'),
        Colonne('Réalisé (FCFA)', 'montant', 'somme'), Colonne('Écart (FCFA)', 'montant', 'somme'),
        Colonne('Taux de réalisation', 'pourcentage', ('ratio', 'Réalisé (FCFA)', 'Prévu (FCFA)')),
    ]
    return Feuille('Prévisions', 'Prévisions budgétaires',
                   "Budget prévu et dépenses réellement engagées sur le même périmètre, la même catégorie et le même mois.",
                   [Tableau(colonnes, lignes)], 'finances')


def feuille_remunerations(p):
    salaires = annoter_salaires(p.salaires().select_related('personne')).order_by(
        'date_debut', 'personne__nom', 'personne__prenom')
    lignes = []
    for s in salaires:
        lignes.append([
            s.date_debut, s.personne.matricule, s.personne.nom_complet, s.montant_brut, s.montant_ponction,
            s.montant_net, s.montant_paye, max(s.montant_net - s.montant_paye, ZERO),
            STATUTS_PAIEMENT[statut_paiement(s.montant_net, s.montant_paye)], s.date_dernier_paiement,
        ])
    colonnes = [
        Colonne('Période', 'mois'), Colonne('Matricule', 'code'), Colonne('Personne'),
        Colonne('Brut', 'montant', 'somme'), Colonne('Ponction', 'montant', 'somme'),
        Colonne('Net dû', 'montant', 'somme'), Colonne('Payé', 'montant', 'somme'),
        Colonne('Reste à payer', 'montant', 'somme'), Colonne('Statut', 'statut'), Colonne('Dernier paiement', 'date'),
    ]
    return Feuille('Rémunérations', 'Rémunérations', "Rémunération de chaque personne par mois : net = brut − ponction.",
                   [Tableau(colonnes, lignes)], 'personnel')


def feuille_paiements(p):
    paiements = PaiementSalaire.objects.filter(salaire__in=p.salaires()).select_related(
        'salaire__personne', 'equipe').order_by('date_paiement', 'id')
    modes = dict(PaiementSalaire.TypePaiement.choices)
    lignes = []
    for paiement in paiements:
        personne = paiement.salaire.personne
        if not paiement.groupe:
            type_paiement = 'Individuel'
        else:
            type_paiement = f"Équipe {paiement.equipe.nom}" if paiement.equipe else 'Groupé'
        lignes.append([
            paiement.date_paiement, personne.nom_complet, personne.matricule, paiement.salaire.date_debut,
            paiement.montant, modes.get(paiement.type_paiement, paiement.type_paiement), type_paiement, paiement.reference,
        ])
    colonnes = [
        Colonne('Date', 'date'), Colonne('Bénéficiaire'), Colonne('Matricule', 'code'), Colonne('Période payée', 'mois'),
        Colonne('Montant (FCFA)', 'montant', 'somme'), Colonne('Mode de paiement'), Colonne('Type'),
        Colonne('Référence', 'code'),
    ]
    return Feuille('Paiements', 'Paiements des rémunérations',
                   "Paiements versés pour les rémunérations de la période, individuels ou groupés par équipe.",
                   [Tableau(colonnes, lignes)], 'personnel')


def feuille_travaux(p):
    travaux = p.sur_periode(p.filtrer(
        Travail.objects.select_related('type_travail', 'bloc__campement', 'equipe'), campement='bloc__campement_id'),
        'date_travail').order_by('date_travail', 'id')
    lignes = [[
        t.date_travail, t.type_travail.libelle, t.bloc.campement.nom, t.bloc.code, t.equipe.nom if t.equipe else '',
        t.quantite, t.unite, t.prix_unitaire, t.montant_total, t.get_statut_display(),
    ] for t in travaux]
    colonnes = [
        Colonne('Date', 'date'), Colonne('Type de travail'), Colonne('Campement'), Colonne('Bloc', 'code'),
        Colonne('Équipe'), Colonne('Quantité', 'quantite'), Colonne('Unité', 'code'), Colonne('Prix unitaire', 'montant'),
        Colonne('Montant (FCFA)', 'montant', 'somme'), Colonne('Statut', 'statut'),
    ]
    return Feuille('Travaux', 'Travaux', "Travaux réalisés ou planifiés par bloc et par équipe : montant = quantité × prix unitaire.",
                   [Tableau(colonnes, lignes)], 'operations')


def feuille_exploitation(p):
    filtre_travaux = Q(travaux__date_travail__range=(p.debut, p.fin)) if p.debut else Q()
    blocs = p.filtrer(Bloc.objects.select_related('campement__plantation'), bloc='pk').annotate(
        nb_travaux=Count('travaux', filter=filtre_travaux, distinct=True),
        nb_equipes=Count('affectations_equipes', filter=Q(affectations_equipes__date_fin__isnull=True), distinct=True),
    )
    depenses = {row['bloc_id']: row['total'] for row in p.sur_periode(Depense.objects.all(), 'date_depense')
                .values('bloc_id').annotate(total=Sum('montant_total'))}
    lignes = [[
        b.campement.plantation.nom, b.campement.nom, b.code, b.nom, b.superficie, 'Oui' if b.actif else 'Non',
        b.nb_equipes, b.nb_travaux, depenses.get(b.pk) or ZERO,
    ] for b in blocs.order_by('campement__plantation__nom', 'campement__nom', 'code')]
    colonnes = [
        Colonne('Plantation'), Colonne('Campement'), Colonne('Code bloc', 'code'), Colonne('Bloc'),
        Colonne('Superficie (ha)', 'quantite', 'somme'), Colonne('Actif', 'code'),
        Colonne('Équipes affectées', 'entier', 'somme'), Colonne('Travaux', 'entier', 'somme'),
        Colonne('Dépenses (FCFA)', 'montant', 'somme'),
    ]
    return Feuille('Exploitation', "Vue d'ensemble de l'exploitation",
                   "Chaque bloc avec sa plantation, son campement, ses équipes, ses travaux et ses dépenses de la période.",
                   [Tableau(colonnes, lignes)], 'operations')


def feuille_stock(p):
    lignes = [[
        produit.code, produit.nom, produit.categorie, produit.unite, produit.stock_calcule, produit.stock_minimum,
        produit.prix_unitaire, produit.stock_calcule * produit.prix_unitaire,
        'Stock faible' if produit.stock_calcule < produit.stock_minimum else 'Suffisant', 'Oui' if produit.actif else 'Non',
    ] for produit in Produit.objects.avec_stock().order_by('nom')]
    colonnes = [
        Colonne('Code', 'code'), Colonne('Produit'), Colonne('Catégorie'), Colonne('Unité', 'code'),
        Colonne('Stock', 'quantite'), Colonne('Seuil minimum', 'quantite'), Colonne('Prix unitaire', 'montant'),
        Colonne('Valeur (FCFA)', 'montant', 'somme'), Colonne('État', 'statut'), Colonne('Actif', 'code'),
    ]
    tableau = Tableau(colonnes, lignes, note="Stock = entrées − sorties ± ajustements. Il est suivi pour toute l'exploitation, pas par bloc.")
    return Feuille('Stock', 'État du stock', "Stock de chaque produit à la date du jour, calculé à partir des mouvements.",
                   [tableau], 'stock', etat_actuel=True, perimetre_applicable=False)


def feuille_mouvements(p):
    mouvements = p.sur_periode(p.filtrer(
        MouvementStock.objects.select_related('produit', 'bloc__campement'), campement='bloc__campement_id'),
        'date_mouvement').order_by('date_mouvement', 'id')
    lignes = [[
        m.date_mouvement, m.produit.nom, m.get_type_mouvement_display(), m.quantite, m.produit.unite, m.prix_unitaire,
        abs(m.quantite) * m.prix_unitaire, m.bloc.campement.nom if m.bloc else '', m.bloc.code if m.bloc else '',
        m.motif, m.reference,
    ] for m in mouvements]
    colonnes = [
        Colonne('Date', 'date'), Colonne('Produit'), Colonne('Type', 'statut'), Colonne('Quantité', 'quantite'),
        Colonne('Unité', 'code'), Colonne('Prix unitaire', 'montant'), Colonne('Valeur (FCFA)', 'montant'),
        Colonne('Campement'), Colonne('Bloc', 'code'), Colonne('Motif', 'long'), Colonne('Référence', 'code'),
    ]
    return Feuille('Mouvements de stock', 'Mouvements de stock', "Entrées, sorties et ajustements de stock, avec le bloc concerné.",
                   [Tableau(colonnes, lignes)], 'stock')


def feuille_journal(p):
    entrees = p.sur_periode(Journal.objects.select_related('utilisateur__personne'), 'date_action__date') \
        .order_by('-date_action')[:10000]
    lignes = [[
        timezone.localtime(j.date_action).replace(tzinfo=None), j.utilisateur.nom_complet if j.utilisateur else 'Système',
        j.action, j.table_concernee, j.details, j.adresse_ip or '',
    ] for j in entrees]
    colonnes = [
        Colonne('Date et heure', 'dateheure'), Colonne('Utilisateur'), Colonne('Action'), Colonne('Élément'),
        Colonne('Détails', 'long'), Colonne('Adresse IP', 'code'),
    ]
    return Feuille('Journal', "Journal d'activité",
                   "Actions enregistrées par l'application, de la plus récente à la plus ancienne (10 000 au plus).",
                   [Tableau(colonnes, lignes)], 'audit', perimetre_applicable=False)


# --- Bilan financier ---

def feuille_bilan(p):
    depenses = p.sur_periode(p.filtrer(Depense.objects.all()), 'date_depense')
    total_depenses = somme(depenses, 'montant_total')
    colonnes_repartition = lambda libelle: [  # noqa: E731
        Colonne(libelle), Colonne('Nombre', 'entier', 'somme'), Colonne('Montant (FCFA)', 'montant', 'somme'),
        Colonne('Part', 'pourcentage', 'somme'),
    ]

    def repartition(champ):
        return [[row[champ], row['nb'], row['montant'], part(row['montant'], total_depenses)]
                for row in depenses.values(champ).annotate(nb=Count('id'), montant=Sum('montant_total')).order_by('-montant')]

    reglement = []
    for code, libelle in STATUTS_PAIEMENT.items():
        agg = depenses.filter(statut=code).aggregate(nb=Count('id'), montant=Sum('montant_total'))
        montant = agg['montant'] or ZERO
        reglement.append([libelle, agg['nb'], montant, part(montant, total_depenses)])

    salaires = p.salaires()
    du = somme(salaires, 'montant_net')
    paye = somme(PaiementSalaire.objects.filter(salaire__in=salaires), 'montant')

    achats = p.sur_periode(p.filtrer(AchatParticulier.objects.all()), 'date_achat')
    montant_achats = somme(achats, 'montant_total')
    paye_achats = somme(PaiementAchat.objects.filter(achat__in=achats), 'montant')

    previsions = {}
    for prevision in p.sur_periode(p.filtrer(Prevision.objects.select_related('categorie')), 'periode_debut'):
        cle = prevision.categorie.libelle if prevision.categorie else 'Toutes catégories'
        cumul = previsions.setdefault(cle, [ZERO, ZERO])
        cumul[0] += prevision.montant_prevu
        cumul[1] += realise_prevision(prevision)

    valeur = [Colonne('Indicateur'), Colonne('Valeur', 'montant')]
    tableaux = [
        Tableau(colonnes_repartition('Catégorie'), repartition('categorie__libelle'), titre='Dépenses par catégorie',
                vide='Aucune dépense pour cette sélection.'),
        Tableau(colonnes_repartition('Campement'), repartition('campement__nom'), titre='Dépenses par campement',
                vide='Aucune dépense pour cette sélection.'),
        Tableau([Colonne('Statut', 'statut'), Colonne('Nombre', 'entier', 'somme'), Colonne('Montant (FCFA)', 'montant', 'somme'),
                 Colonne('Part', 'pourcentage', 'somme')], reglement, titre='Règlement des dépenses'),
        Tableau(valeur, [
            ['Rémunérations nettes dues', du],
            ['Montant payé', paye],
            ['Reste à payer', max(du - paye, ZERO)],
            ['Taux de paiement', Cellule(part(paye, du), 'pourcentage')],
            ['Nombre de rémunérations', Cellule(salaires.count(), 'entier')],
        ], titre='Rémunérations', saut_de_page=True),
        Tableau(valeur, [
            ['Montant des achats', montant_achats],
            ['Payé aux vendeurs', paye_achats],
            ['Reste à payer', max(montant_achats - paye_achats, ZERO)],
            ["Nombre d'achats", Cellule(achats.count(), 'entier')],
        ], titre='Achats aux particuliers'),
        Tableau([
            Colonne('Catégorie'), Colonne('Prévu (FCFA)', 'montant', 'somme'), Colonne('Réalisé (FCFA)', 'montant', 'somme'),
            Colonne('Écart (FCFA)', 'montant', 'somme'),
            Colonne('Taux de réalisation', 'pourcentage', ('ratio', 'Réalisé (FCFA)', 'Prévu (FCFA)')),
        ], [[cle, prevu, realise, realise - prevu, part(realise, prevu)] for cle, (prevu, realise) in sorted(previsions.items())],
            titre='Prévisions et réalisé', vide='Aucune prévision pour cette sélection.'),
        Tableau([Colonne('Poste'), Colonne('Montant (FCFA)', 'montant', 'somme')], [
            ['Dépenses (achats aux particuliers compris)', total_depenses],
            ['Rémunérations nettes dues', du],
        ], titre='Récapitulatif des charges', libelle_total='Total des charges',
            note="Les achats aux particuliers sont déjà comptés dans les dépenses : ils ne sont pas ajoutés une seconde fois."),
    ]
    return Feuille('Bilan financier', 'Bilan financier',
                   "Répartition des dépenses, règlements, rémunérations, achats, prévisions et total des charges.",
                   tableaux, 'synthese')


# --- Synthèse (indicateurs clés et graphiques) ---

def synthese(p):
    depenses = p.sur_periode(p.filtrer(Depense.objects.all()), 'date_depense')
    total_depenses = somme(depenses, 'montant_total')
    payees = somme(depenses.filter(statut='PAYEE'), 'montant_total')
    evolution = None
    if p.periode:
        debut, fin = parse_periode(shift_periode(p.periode, -1))
        precedent = somme(p.filtrer(Depense.objects.filter(date_depense__range=(debut, fin))), 'montant_total')
        evolution = part(total_depenses - precedent, precedent)

    salaires = p.salaires()
    du = somme(salaires, 'montant_net')
    paye = somme(PaiementSalaire.objects.filter(salaire__in=salaires), 'montant')

    travaux = p.sur_periode(p.filtrer(Travail.objects.exclude(statut='ANNULE'), campement='bloc__campement_id'), 'date_travail')
    achats = p.sur_periode(p.filtrer(AchatParticulier.objects.all()), 'date_achat')
    produits = list(Produit.objects.filter(actif=True).avec_stock())
    previsions = list(p.sur_periode(p.filtrer(Prevision.objects.all()), 'periode_debut'))
    prevu = sum((prev.montant_prevu for prev in previsions), ZERO)
    realise = sum((realise_prevision(prev) for prev in previsions), ZERO)

    groupes = [
        ('Dépenses', [
            Indicateur('Total des dépenses', total_depenses, 'montant'),
            Indicateur('Dépenses payées', payees, 'montant'),
            Indicateur('Dépenses en attente', total_depenses - payees, 'montant'),
            Indicateur('Évolution sur un mois', evolution, 'evolution'),
        ]),
        ('Rémunérations', [
            Indicateur('Net dû', du, 'montant'),
            Indicateur('Payé', paye, 'montant'),
            Indicateur('Reste à payer', max(du - paye, ZERO), 'montant'),
            Indicateur('Taux de paiement', part(paye, du), 'pourcentage'),
        ]),
        ('Activité', [
            Indicateur('Travaux (hors annulés)', travaux.count(), 'entier'),
            Indicateur('Surface travaillée (ha)', somme(travaux.filter(unite='ha'), 'quantite'), 'quantite'),
            Indicateur('Achats aux particuliers', somme(achats, 'montant_total'), 'montant'),
            Indicateur('Blocs actifs', p.filtrer(Bloc.objects.filter(actif=True), bloc='pk').count(), 'entier'),
        ]),
        ('Stock et budget', [
            Indicateur('Valeur du stock', sum((pr.stock_calcule * pr.prix_unitaire for pr in produits), ZERO), 'montant'),
            Indicateur('Produits en alerte', sum(1 for pr in produits if pr.stock_calcule < pr.stock_minimum), 'entier'),
            Indicateur('Budget prévu', prevu, 'montant'),
            Indicateur('Réalisation du budget', part(realise, prevu), 'pourcentage'),
        ]),
    ]

    categories = [(row['categorie__libelle'], row['total'])
                  for row in depenses.values('categorie__libelle').annotate(total=Sum('montant_total')).order_by('-total')
                  if row['total']]

    # Six derniers mois jusqu'à la période choisie (ou la plus récente disposant de données)
    disponibles = periodes_disponibles()
    fin_periode = p.periode or (disponibles[0] if disponibles else timezone.localdate().strftime('%Y-%m'))
    mois = [shift_periode(fin_periode, decalage) for decalage in range(-5, 1)]
    debut_6, _ = parse_periode(mois[0])
    _, fin_6 = parse_periode(mois[-1])
    totaux = {periode_of(row['m']): row['total'] for row in p.filtrer(Depense.objects.filter(date_depense__range=(debut_6, fin_6)))
              .annotate(m=TruncMonth('date_depense')).values('m').annotate(total=Sum('montant_total'))}
    evolution_6_mois = [(f"{MOIS_COURTS[int(m[5:7]) - 1]} {m[:4]}", totaux.get(m) or ZERO) for m in mois]

    return Synthese(groupes, categories, evolution_6_mois)


def feuilles(p, avec_journal=False):
    """Feuilles de détail, dans l'ordre du classeur (après la synthèse)."""
    liste = [
        feuille_bilan(p), feuille_depenses(p), feuille_achats(p), feuille_previsions(p),
        feuille_remunerations(p), feuille_paiements(p), feuille_travaux(p), feuille_exploitation(p),
        feuille_stock(p), feuille_mouvements(p),
    ]
    if avec_journal:
        liste.append(feuille_journal(p))
    return liste
