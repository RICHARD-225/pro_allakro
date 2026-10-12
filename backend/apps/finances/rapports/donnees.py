"""Contenu du rapport : une feuille par thème, avec des valeurs typées (dates, montants, textes) calculées en base."""
from dataclasses import dataclass, field
from decimal import Decimal

from django.db.models import Count, DecimalField, Q, Sum, Value
from django.db.models.functions import Coalesce, TruncMonth
from django.utils import timezone

from apps.accounts.models import Journal
from apps.achats.models import AchatParticulier, PaiementAchat
from apps.core.models import Bloc, Campement
from apps.core.utils import parse_periode, periode_of, shift_periode
from apps.exploitation.models import Travail
from apps.stock.models import MouvementStock, Produit

from ..calculs import STATUTS_REMUNERATION, annoter_salaires, statut_paiement, statut_remuneration
from ..models import Depense, PaiementSalaire
from ..tableau_de_bord import MOIS_COURTS, periodes_disponibles

ZERO = Decimal('0')
ZERO_SQL = Value(ZERO, output_field=DecimalField(max_digits=15, decimal_places=2))
STATUTS_PAIEMENT = {'PAYEE': 'Payée', 'PARTIELLE': 'Partiellement payée', 'NON_PAYEE': 'Non payée'}  # achats (règlement du vendeur)
STATUTS_DEPENSE = {'PAYEE': 'Payée', 'AVANCE': 'Avance'}


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


COLONNES_LIEU = [Colonne('Campement'), Colonne('Responsable du campement'), Colonne('Bloc', 'code')]


def lieu(bloc=None, campement=None):
    """Campement, responsable du campement et bloc d'une ligne : chaque donnée est rattachée à son lieu."""
    campement = bloc.campement if bloc is not None else campement
    responsable = campement.responsable.nom_complet if campement is not None and campement.responsable_id else ''
    return [campement.nom if campement is not None else '', responsable, bloc.code if bloc is not None else '']


def activite_de(depense):
    """Activité du travail dont la dépense est le paiement d'un salaire ; sinon « Hors travaux »."""
    paiement = getattr(depense, 'paiement_salaire', None)
    travail = paiement.salaire.travail if paiement is not None else None
    return travail.activite_libelle if travail is not None else 'Hors travaux'


def part(montant, total):
    return (montant / total) if total else None


def somme(queryset, champ):
    return queryset.aggregate(total=Sum(champ))['total'] or ZERO


# --- Feuilles de détail ---

def feuille_depenses(p):
    depenses = p.sur_periode(p.filtrer(
        Depense.objects.select_related('categorie', 'campement__responsable', 'bloc__campement__responsable',
                                       'achat_particulier', 'paiement_salaire')), 'date_depense')
    lignes = []
    for d in depenses.order_by('date_depense', 'id'):
        achat = getattr(d, 'achat_particulier', None)
        paiement = getattr(d, 'paiement_salaire', None)
        source = f"Achat {achat.reference}" if achat else (f"Salaire {paiement.numero}" if paiement else 'Saisie directe')
        lignes.append([
            d.date_depense, d.date_depense, d.designation, d.categorie.libelle, activite_de(d), *lieu(d.bloc, d.campement),
            d.quantite, d.unite, d.prix_unitaire, d.montant_total, STATUTS_DEPENSE.get(d.statut, d.statut), source,
        ])
    colonnes = [
        Colonne('Date', 'date'), Colonne('Période', 'mois'), Colonne('Désignation', 'long'), Colonne('Catégorie'),
        Colonne('Activité'), *COLONNES_LIEU, Colonne('Quantité', 'quantite'), Colonne('Unité', 'code'),
        Colonne('Prix unitaire', 'montant'), Colonne('Montant (FCFA)', 'montant', 'somme'),
        Colonne('Statut', 'statut'), Colonne('Source'),
    ]
    return Feuille('Dépenses', 'Dépenses', "Toutes les dépenses, y compris celles créées par les achats aux particuliers.",
                   [Tableau(colonnes, lignes)], 'finances')


def feuille_achats(p):
    achats = p.sur_periode(p.filtrer(
        AchatParticulier.objects.select_related('particulier', 'campement__responsable', 'bloc__campement__responsable')
        .annotate(paye=Coalesce(Sum('paiements__montant'), ZERO_SQL))), 'date_achat')
    lignes = []
    for a in achats.order_by('date_achat', 'id'):
        lignes.append([
            a.reference, a.date_achat, str(a.particulier), a.particulier.telephone, a.designation, a.poids,
            a.unite_poids, a.prix_unitaire, a.montant_total, a.paye, max(a.montant_total - a.paye, ZERO),
            STATUTS_PAIEMENT[statut_paiement(a.montant_total, a.paye)], *lieu(a.bloc, a.campement),
        ])
    colonnes = [
        Colonne('Référence', 'code'), Colonne('Date', 'date'), Colonne('Vendeur'), Colonne('Téléphone', 'code'),
        Colonne('Produit', 'long'), Colonne('Poids / Qté', 'quantite'), Colonne('Unité', 'code'),
        Colonne('Prix unitaire', 'montant'), Colonne('Montant (FCFA)', 'montant', 'somme'),
        Colonne('Payé', 'montant', 'somme'), Colonne('Reste à payer', 'montant', 'somme'),
        Colonne('Statut', 'statut'), *COLONNES_LIEU,
    ]
    return Feuille('Achats particuliers', 'Achats aux particuliers',
                   "Produits achetés à des particuliers : montant = poids × prix unitaire, et règlement des vendeurs.",
                   [Tableau(colonnes, lignes)], 'finances')


def feuille_remunerations(p):
    salaires = annoter_salaires(p.salaires().select_related(
        'personne__campement__responsable', 'bloc__campement__responsable', 'travail__type_travail',
        'travail__equipe')).order_by('date_debut', 'personne__nom', 'personne__prenom')
    lignes = []
    for s in salaires:
        statut = statut_remuneration(s, s.montant_paye)
        travail = s.travail
        lignes.append([
            s.date_debut, s.libelle, 'Travail' if travail else 'Manuelle', travail.activite_libelle if travail else '',
            *lieu(s.bloc, s.personne.campement), s.personne.matricule, s.personne.nom_complet,
            travail.equipe.nom if travail and travail.equipe_id else '', s.montant_brut, s.montant_ponction, s.montant_net,
            s.montant_paye, ZERO if statut == 'ANNULEE' else max(s.montant_net - s.montant_paye, ZERO),
            STATUTS_REMUNERATION[statut], s.date_dernier_paiement,
        ])
    colonnes = [
        Colonne('Date', 'date'), Colonne('Rémunération', 'long'), Colonne('Origine'), Colonne('Activité'),
        *COLONNES_LIEU, Colonne('Matricule', 'code'), Colonne('Titulaire (chef ou personne)'), Colonne('Équipe'),
        Colonne('Brut', 'montant', 'somme'), Colonne('Ponction', 'montant', 'somme'), Colonne('Net dû', 'montant', 'somme'),
        Colonne('Payé', 'montant', 'somme'), Colonne('Reste à payer', 'montant', 'somme'), Colonne('Statut', 'statut'),
        Colonne('Dernier paiement', 'date'),
    ]
    return Feuille('Rémunérations', 'Rémunérations (salaires)',
                   "Rémunérations générées par les travaux et rémunérations manuelles : net = brut − ponction.",
                   [Tableau(colonnes, lignes)], 'personnel')


def feuille_paiements(p):
    paiements = PaiementSalaire.objects.filter(salaire__in=p.salaires(), annule=False).select_related(
        'beneficiaire', 'salaire__personne__campement__responsable', 'salaire__bloc__campement__responsable',
        'salaire__travail__type_travail', 'salaire__travail__equipe',
    ).order_by('date_paiement', 'id')
    modes = dict(PaiementSalaire.TypePaiement.choices)
    lignes = []
    for paiement in paiements:
        salaire = paiement.salaire
        travail = salaire.travail
        beneficiaire = paiement.beneficiaire or salaire.personne
        en_equipe = bool(travail and travail.equipe_id)
        if en_equipe:
            versement = "Via le chef d'équipe" if beneficiaire.pk == salaire.personne_id else 'Via un membre'
        else:
            versement = 'Direct'
        lignes.append([
            paiement.numero, paiement.date_paiement, beneficiaire.nom_complet, beneficiaire.matricule, salaire.libelle,
            *lieu(salaire.bloc, salaire.personne.campement), paiement.montant, modes.get(paiement.type_paiement, paiement.type_paiement),
            'Avance' if paiement.est_avance else 'Paiement', versement, paiement.reference,
        ])
    colonnes = [
        Colonne('N° reçu', 'code'), Colonne('Date', 'date'), Colonne('Bénéficiaire'), Colonne('Matricule', 'code'),
        Colonne('Rémunération', 'long'), *COLONNES_LIEU, Colonne('Montant (FCFA)', 'montant', 'somme'),
        Colonne('Mode de paiement'), Colonne('Nature'), Colonne('Versement'), Colonne('Référence', 'code'),
    ]
    return Feuille('Paiements', 'Paiements des salaires',
                   "Paiements et avances versés pour les rémunérations de la période (chacun a son reçu et sa dépense).",
                   [Tableau(colonnes, lignes)], 'personnel')


def feuille_travaux(p):
    Travail.objects.rafraichir_statuts()
    travaux = p.sur_periode(p.filtrer(
        Travail.objects.exclude(statut=Travail.Statut.ANNULE)
        .select_related('type_travail', 'bloc__campement__responsable', 'equipe', 'responsable')
        .annotate(nb_personnes=Count('participants', filter=Q(participants__date_retrait__isnull=True))),
        campement='bloc__campement_id'), 'date_travail').order_by('date_travail', 'id')
    lignes = [[
        t.date_travail, t.date_fin, t.activite_libelle, *lieu(t.bloc),
        t.equipe.nom if t.equipe else '', t.responsable.nom_complet if t.responsable_id else '', t.nb_personnes,
        t.quantite, t.unite, t.prix_unitaire, t.montant_total, t.get_statut_display(),
    ] for t in travaux]
    colonnes = [
        Colonne('Début', 'date'), Colonne('Fin', 'date'), Colonne('Activité'), *COLONNES_LIEU,
        Colonne('Équipe'), Colonne('Chef / responsable'), Colonne('Personnes', 'entier'), Colonne('Quantité', 'quantite'),
        Colonne('Unité', 'code'), Colonne('Prix unitaire', 'montant'), Colonne('Montant (FCFA)', 'montant', 'somme'),
        Colonne('Statut', 'statut'),
    ]
    return Feuille('Travaux', 'Travaux', "Travaux par bloc avec leur équipe ou leur responsable : montant = quantité × prix unitaire.",
                   [Tableau(colonnes, lignes)], 'operations')


def feuille_exploitation(p):
    filtre_travaux = Q(travaux__date_travail__range=(p.debut, p.fin)) if p.debut else Q()
    blocs = p.filtrer(Bloc.objects.select_related('campement__plantation', 'campement__responsable'), bloc='pk').annotate(
        nb_travaux=Count('travaux', filter=filtre_travaux, distinct=True),
        nb_personnes=Count('personnes', filter=Q(personnes__actif=True), distinct=True),
    )
    depenses = {row['bloc_id']: row['total'] for row in p.sur_periode(Depense.objects.all(), 'date_depense')
                .values('bloc_id').annotate(total=Sum('montant_total'))}
    lignes = [[
        b.campement.plantation.nom, b.campement.nom, b.campement.responsable.nom_complet if b.campement.responsable_id else '',
        b.code, b.nom, b.superficie, b.nombre_plantes,
        'Oui' if b.actif else 'Non', b.nb_personnes, b.nb_travaux, depenses.get(b.pk) or ZERO,
    ] for b in blocs.order_by('campement__plantation__nom', 'campement__nom', 'code')]
    colonnes = [
        Colonne('Plantation'), Colonne('Campement'), Colonne('Responsable du campement'), Colonne('Code bloc', 'code'), Colonne('Bloc'),
        Colonne('Superficie (ha)', 'quantite', 'somme'), Colonne('Nombre de plantes', 'entier', 'somme'),
        Colonne('Actif', 'code'), Colonne('Personnes affectées', 'entier', 'somme'), Colonne('Travaux', 'entier', 'somme'),
        Colonne('Dépenses (FCFA)', 'montant', 'somme'),
    ]
    return Feuille('Exploitation', "Vue d'ensemble de l'exploitation",
                   "Chaque bloc avec sa plantation, son campement, ses plantes, son personnel, ses travaux et ses dépenses.",
                   [Tableau(colonnes, lignes)], 'operations')


def feuille_stock(p):
    lignes = [[
        produit.code, produit.nom, produit.categorie, produit.unite, produit.stock_calcule, produit.stock_minimum,
        produit.prix_unitaire, produit.stock_calcule * produit.prix_unitaire,
        'Stock faible' if produit.stock_calcule < produit.stock_minimum else 'Suffisant', 'Oui' if produit.actif else 'Non',
    ] for produit in Produit.objects.filter(actif=True).avec_stock().order_by('nom')]
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
        MouvementStock.objects.select_related('produit', 'bloc__campement__responsable'), campement='bloc__campement_id'),
        'date_mouvement').order_by('date_mouvement', 'id')
    lignes = [[
        m.date_mouvement, m.produit.nom, m.get_type_mouvement_display(), m.quantite, m.produit.unite, m.prix_unitaire,
        abs(m.quantite) * m.prix_unitaire, *lieu(m.bloc),
        m.motif, m.reference,
    ] for m in mouvements]
    colonnes = [
        Colonne('Date', 'date'), Colonne('Produit'), Colonne('Type', 'statut'), Colonne('Quantité', 'quantite'),
        Colonne('Unité', 'code'), Colonne('Prix unitaire', 'montant'), Colonne('Valeur (FCFA)', 'montant'),
        *COLONNES_LIEU, Colonne('Motif', 'long'), Colonne('Référence', 'code'),
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

    campements = {c.pk: c for c in Campement.objects.select_related('responsable')}
    par_campement = []
    for row in depenses.values('campement_id').annotate(nb=Count('id'), montant=Sum('montant_total')).order_by('-montant'):
        c = campements.get(row['campement_id'])
        par_campement.append([c.nom if c else '', c.responsable.nom_complet if c and c.responsable_id else '',
                              row['nb'], row['montant'], part(row['montant'], total_depenses)])
    par_bloc = []
    for row in depenses.values('bloc__code', 'bloc__nom', 'bloc__campement__nom').annotate(
            nb=Count('id'), montant=Sum('montant_total')).order_by('-montant'):
        libelle_bloc = f"{row['bloc__code']} — {row['bloc__nom']}" if row['bloc__code'] else 'Sans bloc'
        par_bloc.append([libelle_bloc, row['bloc__campement__nom'] or '', row['nb'], row['montant'], part(row['montant'], total_depenses)])
    par_activite = {}
    for depense in depenses.select_related('paiement_salaire__salaire__travail__type_travail'):
        cumul = par_activite.setdefault(activite_de(depense), [0, ZERO])
        cumul[0] += 1
        cumul[1] += depense.montant_total
    par_activite = [[nom, nb, montant, part(montant, total_depenses)]
                    for nom, (nb, montant) in sorted(par_activite.items(), key=lambda x: -x[1][1])]

    reglement = []
    for code, libelle in STATUTS_DEPENSE.items():
        agg = depenses.filter(statut=code).aggregate(nb=Count('id'), montant=Sum('montant_total'))
        montant = agg['montant'] or ZERO
        reglement.append([libelle, agg['nb'], montant, part(montant, total_depenses)])

    salaires = p.salaires()
    du = somme(salaires, 'montant_net')
    paye = somme(PaiementSalaire.objects.filter(salaire__in=salaires, annule=False), 'montant')

    achats = p.sur_periode(p.filtrer(AchatParticulier.objects.all()), 'date_achat')
    montant_achats = somme(achats, 'montant_total')
    paye_achats = somme(PaiementAchat.objects.filter(achat__in=achats), 'montant')

    valeur = [Colonne('Indicateur'), Colonne('Valeur', 'montant')]
    tableaux = [
        Tableau(colonnes_repartition('Catégorie'), repartition('categorie__libelle'), titre='Dépenses par catégorie',
                vide='Aucune dépense pour cette sélection.'),
        Tableau([Colonne('Campement'), Colonne('Responsable du campement'), Colonne('Nombre', 'entier', 'somme'),
                 Colonne('Montant (FCFA)', 'montant', 'somme'), Colonne('Part', 'pourcentage', 'somme')],
                par_campement, titre='Dépenses par campement', vide='Aucune dépense pour cette sélection.'),
        Tableau([Colonne('Bloc'), Colonne('Campement'), Colonne('Nombre', 'entier', 'somme'),
                 Colonne('Montant (FCFA)', 'montant', 'somme'), Colonne('Part', 'pourcentage', 'somme')],
                par_bloc, titre='Dépenses par bloc', vide='Aucune dépense pour cette sélection.'),
        Tableau(colonnes_repartition('Activité'), par_activite, titre='Dépenses par activité',
                note="Un salaire payé est rattaché à l'activité de son travail ; les autres dépenses sont « Hors travaux ».",
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
        Tableau([Colonne('Poste'), Colonne('Montant (FCFA)', 'montant', 'somme')], [
            ['Dépenses (sommes versées : salaires, avances et achats réglés)', total_depenses],
            ['Salaires restant à payer', max(du - paye, ZERO)],
            ['Achats restant à régler aux vendeurs', max(montant_achats - paye_achats, ZERO)],
        ], titre='Récapitulatif des charges', libelle_total='Total des charges',
            note=("Les dépenses ne comptent que les sommes réellement versées (paiements de salaires, avances, règlements "
                  "des achats) ; le reste à payer des salaires et le reste à régler des achats s'y ajoutent.")),
    ]
    return Feuille('Bilan financier', 'Bilan financier',
                   "Répartition des dépenses, règlements, rémunérations, achats et total des charges.",
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
    paye = somme(PaiementSalaire.objects.filter(salaire__in=salaires, annule=False), 'montant')

    travaux = p.sur_periode(p.filtrer(Travail.objects.exclude(statut='ANNULE'), campement='bloc__campement_id'), 'date_travail')
    achats = p.sur_periode(p.filtrer(AchatParticulier.objects.all()), 'date_achat')
    produits = list(Produit.objects.filter(actif=True).avec_stock())
    mouvements = p.sur_periode(p.filtrer(MouvementStock.objects.all(), campement='bloc__campement_id'), 'date_mouvement')

    groupes = [
        ('Dépenses', [
            Indicateur('Total des dépenses', total_depenses, 'montant'),
            Indicateur('Dépenses payées', payees, 'montant'),
            Indicateur('Avances (à solder)', total_depenses - payees, 'montant'),
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
        ('Stock', [
            Indicateur('Valeur du stock', sum((pr.stock_calcule * pr.prix_unitaire for pr in produits), ZERO), 'montant'),
            Indicateur('Produits en alerte', sum(1 for pr in produits if pr.stock_calcule < pr.stock_minimum), 'entier'),
            Indicateur('Produits suivis', len(produits), 'entier'),
            Indicateur('Mouvements de la période', mouvements.count(), 'entier'),
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
        feuille_bilan(p), feuille_depenses(p), feuille_achats(p),
        feuille_remunerations(p), feuille_paiements(p), feuille_travaux(p), feuille_exploitation(p),
        feuille_stock(p), feuille_mouvements(p),
    ]
    if avec_journal:
        liste.append(feuille_journal(p))
    return liste
