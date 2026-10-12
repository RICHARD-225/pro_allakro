"""Mise en page du rapport Excel : charte ALLAKRO, tableaux lisibles, graphiques et impression A4 propre."""
import io
import math
from datetime import date
from decimal import Decimal

import xlsxwriter
from django.utils import timezone
from xlsxwriter.utility import xl_range, xl_rowcol_to_cell

from . import donnees
from .donnees import Cellule

XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

# Charte graphique (couleurs de l'interface)
VERT_NUIT = '#1c3a27'
VERT = '#2f6142'
VERT_PALE = '#dceee0'
VERT_BANDE = '#f4f9f5'
CREME = '#fbfaf7'
TEXTE = '#383b38'
GRIS = '#697069'
GRIS_CLAIR = '#acb3ac'
LIGNE = '#e7e9e7'
BLANC = '#ffffff'

COULEURS_THEMES = {
    'synthese': VERT, 'finances': '#ad6e47', 'personnel': '#97902f', 'operations': '#519744',
    'stock': '#5e8767', 'audit': '#888f88',
}
COULEURS_GROUPES = {'Dépenses': '#ad6e47', 'Rémunérations': '#97902f', 'Activité': '#519744', 'Stock': '#5e8767'}
COULEURS_GRAPHIQUE = ['#2f6142', '#519744', '#97902f', '#5e8767', '#ad6e47', '#73b063', '#c8c45e', '#7fa385', '#cd8f6e', '#486d50']

# Statuts mis en couleur : (fond, texte)
VERT_STATUT = ('#e1f2dc', '#31602a')
OLIVE_STATUT = ('#f3f1d2', '#5e561e')
TERRE_STATUT = ('#f5eae1', '#814631')
STATUTS = {
    'Payée': VERT_STATUT, 'Partiellement payée': OLIVE_STATUT, 'Non payée': TERRE_STATUT,
    'Payé': VERT_STATUT, 'Partiellement payé': OLIVE_STATUT, 'À payer': TERRE_STATUT,
    'Terminé': VERT_STATUT, 'En cours': OLIVE_STATUT, 'À venir': ('#e5ece7', '#3b5741'), 'Planifié': ('#e5ece7', '#3b5741'),
    'Annulé': ('#e7e9e7', '#525852'),
    'Suffisant': VERT_STATUT, 'Stock faible': TERRE_STATUT,
    'Entrée': VERT_STATUT, 'Sortie': TERRE_STATUT, 'Ajustement': OLIVE_STATUT,
}

FORMATS = {
    'date': 'dd/mm/yyyy', 'dateheure': 'dd/mm/yyyy hh:mm', 'mois': 'mmmm yyyy', 'entier': '#,##0',
    'montant': '#,##0', 'montant_dec': '#,##0.00', 'quantite': '#,##0', 'quantite_dec': '#,##0.0##',
    'pourcentage': '0.0%', 'evolution': '"▲ "0.0%;"▼ "0.0%;0.0%',
}
ALIGNEMENTS = {
    'date': 'center', 'dateheure': 'center', 'mois': 'left', 'montant': 'right', 'quantite': 'right',
    'entier': 'right', 'pourcentage': 'right', 'evolution': 'center', 'statut': 'center',
}
NUMERIQUES = {'montant', 'quantite', 'entier', 'pourcentage', 'evolution'}
LARGEUR_MIN = {'date': 11, 'dateheure': 16, 'mois': 15, 'statut': 15, 'montant': 12, 'quantite': 10, 'entier': 9,
               'pourcentage': 11, 'code': 8, 'texte': 10, 'long': 26}
LARGEUR_MAX = {'long': 46, 'texte': 44, 'code': 24}
LONGUEUR_SANS_RETOUR = 40  # au-delà, un texte long passe à la ligne


def a_des_decimales(valeur):
    if isinstance(valeur, Decimal):
        return valeur != valeur.to_integral_value()
    if isinstance(valeur, float):
        return not valeur.is_integer()
    return False


def est_nombre(valeur):
    return isinstance(valeur, (int, float, Decimal)) and not isinstance(valeur, bool)


def longueur_affichee(valeur, type_):
    """Nombre de caractères affichés, pour régler la largeur des colonnes."""
    if isinstance(valeur, Cellule):
        valeur, type_ = valeur.valeur, valeur.type
    if valeur is None or valeur == '':
        return 0
    if type_ in ('date', 'dateheure', 'mois', 'pourcentage', 'evolution'):
        return {'date': 10, 'dateheure': 16, 'mois': 14}.get(type_, 7)
    if est_nombre(valeur):
        return len(f"{float(valeur):,.2f}" if a_des_decimales(valeur) else f"{float(valeur):,.0f}")
    return len(str(valeur))


def plages_sans_statut(colonnes):
    """Plages de colonnes contiguës hors statut (les statuts gardent leur propre couleur de fond)."""
    plages, debut = [], None
    for c, colonne in enumerate(colonnes):
        if colonne.type == 'statut':
            if debut is not None:
                plages.append((debut, c - 1))
                debut = None
        elif debut is None:
            debut = c
    if debut is not None:
        plages.append((debut, len(colonnes) - 1))
    return plages


def echapper(texte):
    """Les en-têtes et pieds de page d'Excel interprètent « & » comme un code."""
    return str(texte).replace('&', '&&')


def avec_marge(proprietes):
    """Petite marge intérieure (retrait d'un caractère) pour les textes et nombres alignés sur un bord."""
    if proprietes.get('align', 'left') in ('left', 'right'):
        proprietes.setdefault('indent', 1)
    return proprietes


class RapportExcel:
    def __init__(self, classeur, perimetre, utilisateur):
        self.wb = classeur
        self.p = perimetre
        self.genere_le = timezone.localtime()
        self.auteur = f"{utilisateur.nom_complet} ({utilisateur.role.libelle})"
        self._styles = {}
        # Format de mise en forme conditionnelle : uniquement la couleur de fond
        self.bande = classeur.add_format({'bg_color': VERT_BANDE})

    # --- Styles ---
    def style(self, **proprietes):
        cle = tuple(sorted(proprietes.items()))
        if cle not in self._styles:
            base = {'font_name': 'Calibri', 'font_size': 10, 'font_color': TEXTE, 'valign': 'vcenter'}
            base.update(proprietes)
            self._styles[cle] = self.wb.add_format(base)
        return self._styles[cle]

    def style_cellule(self, type_, valeur, **extra):
        proprietes = {'align': ALIGNEMENTS.get(type_, 'left'), 'bottom': 1, 'bottom_color': LIGNE}
        if type_ in ('montant', 'quantite'):
            proprietes['num_format'] = FORMATS[type_ + ('_dec' if a_des_decimales(valeur) else '')]
        elif type_ in FORMATS:
            proprietes['num_format'] = FORMATS[type_]
        if type_ == 'statut' and valeur in STATUTS:
            fond, couleur = STATUTS[valeur]
            proprietes.update(bg_color=fond, font_color=couleur, bold=True)
        elif type_ == 'code':
            proprietes['font_color'] = GRIS
        elif type_ == 'long' and len(str(valeur or '')) > LONGUEUR_SANS_RETOUR:
            proprietes['text_wrap'] = True
        proprietes.update(extra)
        return self.style(**avec_marge(proprietes))

    def ecrire(self, ws, ligne, col, valeur, type_, **extra):
        if isinstance(valeur, Cellule):
            valeur, type_ = valeur.valeur, valeur.type
        fmt = self.style_cellule(type_, valeur, **extra)
        if valeur is None or valeur == '':
            if type_ in ('pourcentage', 'evolution'):
                ws.write_string(ligne, col, '—', self.style_cellule(type_, None, align='center', font_color=GRIS_CLAIR, **extra))
            else:
                ws.write_blank(ligne, col, None, fmt)
        elif est_nombre(valeur):
            ws.write_number(ligne, col, float(valeur), fmt)
        elif isinstance(valeur, date):
            ws.write_datetime(ligne, col, valeur, fmt)
        else:
            ws.write_string(ligne, col, str(valeur), fmt)

    # --- Feuilles de détail ---
    def feuille(self, feuille):
        ws = self.wb.add_worksheet(feuille.nom)
        nb_colonnes = max(len(t.colonnes) for t in feuille.tableaux)
        paysage = nb_colonnes > 7
        largeurs = self.largeurs(feuille.tableaux)
        for col, largeur in largeurs.items():
            ws.set_column(col, col, largeur)

        ligne = self.entete_feuille(ws, feuille, nb_colonnes)
        unique = len(feuille.tableaux) == 1
        ligne_entete = None
        sauts = []
        for i, tableau in enumerate(feuille.tableaux):
            if tableau.saut_de_page:
                sauts.append(ligne)
            elif i:
                ws.set_row(ligne, 10)
                ligne += 1
            ligne, entete = self.tableau(ws, ligne, tableau, filtre=unique)
            if unique:
                ligne_entete = entete
        echelle = None
        if sauts:
            # Excel ignore les sauts de page manuels en mode « ajuster à la page » : on calcule une échelle fixe
            ws.set_h_pagebreaks(sauts)
            # Largeur estimée avec une marge de sécurité (le rendu réel d'Excel est un peu plus large)
            largeur_px = sum(7.5 * largeur + 5 for largeur in largeurs.values()) * 1.05
            largeur_page_px = 1045 if paysage else 716  # A4 moins les marges, à 96 points par pouce
            echelle = max(40, min(100, int(largeur_page_px / largeur_px * 100)))
        self.mise_en_page(ws, feuille.titre, feuille.theme, paysage=paysage, ligne_entete=ligne_entete, echelle=echelle)

    def largeurs(self, tableaux):
        largeurs = {}
        for tableau in tableaux:
            for c, colonne in enumerate(tableau.colonnes):
                mots = colonne.titre.split()
                entete = max(max(len(m) for m in mots), math.ceil(len(colonne.titre) / 2)) + 3
                valeurs = max((longueur_affichee(ligne[c], colonne.type) for ligne in tableau.lignes), default=0)
                valeurs += 4 if colonne.type == 'statut' else 3
                besoin = max(entete, valeurs, LARGEUR_MIN.get(colonne.type, 10))
                largeurs[c] = max(largeurs.get(c, 0), min(besoin, LARGEUR_MAX.get(colonne.type, 40)))
        return largeurs

    def entete_feuille(self, ws, feuille, nb_colonnes):
        ws.set_row(0, 30)
        ws.write_string(0, 0, feuille.titre, self.style(bold=True, font_size=18, font_color=VERT_NUIT))
        ws.write_url(0, nb_colonnes - 1, "internal:'Synthèse'!A1",
                     self.style(font_size=9, font_color=VERT, underline=1, align='right'), string='← Synthèse')
        ws.write_string(1, 0, feuille.description, self.style(font_color=GRIS))
        contexte = [
            f"État au {self.genere_le:%d/%m/%Y}" if feuille.etat_actuel else f"Période : {self.p.libelle_periode}",
            f"Périmètre : {self.p.libelle_perimetre}" if feuille.perimetre_applicable else "Périmètre : toute l'exploitation",
        ]
        if len(feuille.tableaux) == 1:
            contexte.append(f"{feuille.nb_lignes} ligne{'s' if feuille.nb_lignes > 1 else ''}")
        ws.write_string(2, 0, '   ·   '.join(contexte), self.style(font_size=9, italic=True, font_color=GRIS))
        ws.set_row(3, 8)
        return 4

    def tableau(self, ws, ligne, tableau, filtre=False):
        """Écrit un tableau à partir de `ligne` ; renvoie (ligne suivante, ligne d'en-tête)."""
        colonnes = tableau.colonnes
        derniere_col = len(colonnes) - 1
        if tableau.titre:
            ws.write_string(ligne, 0, tableau.titre, self.style(bold=True, font_size=12, font_color=VERT))
            ws.set_row(ligne, 22)
            ligne += 1

        entete = ligne
        for c, colonne in enumerate(colonnes):
            alignement = 'right' if colonne.type in NUMERIQUES else ALIGNEMENTS.get(colonne.type, 'left')
            ws.write_string(ligne, c, colonne.titre, self.style(**avec_marge(dict(
                bold=True, font_color=BLANC, bg_color=VERT, text_wrap=True, align=alignement, border=1, border_color=VERT))))
        ws.set_row(ligne, 30)
        ligne += 1

        if not tableau.lignes:
            fmt = self.style(italic=True, font_color=GRIS, align='center', bottom=1, bottom_color=LIGNE)
            ws.merge_range(ligne, 0, ligne, derniere_col, tableau.vide, fmt)
            ws.set_row(ligne, 24)
            return self.note(ws, ligne + 1, tableau), entete

        premiere = ligne
        for valeurs in tableau.lignes:
            for c, (colonne, valeur) in enumerate(zip(colonnes, valeurs)):
                self.ecrire(ws, ligne, c, valeur, colonne.type)
            ligne += 1
        derniere = ligne - 1

        # Lignes alternées (sauf colonnes de statut, déjà colorées)
        for debut, fin in plages_sans_statut(colonnes):
            ws.conditional_format(premiere, debut, derniere, fin,
                                  {'type': 'formula', 'criteria': '=MOD(ROW(),2)=0', 'format': self.bande})
        if filtre:
            ws.autofilter(entete, 0, derniere, derniere_col)
        if any(colonne.total for colonne in colonnes):
            self.ligne_total(ws, ligne, tableau, premiere, derniere)
            ligne += 1
        return self.note(ws, ligne, tableau), entete

    def ligne_total(self, ws, ligne, tableau, premiere, derniere):
        """Totaux en formules (SOUS.TOTAL : ils suivent les filtres), avec la valeur déjà calculée."""
        colonnes = tableau.colonnes
        index = {colonne.titre: c for c, colonne in enumerate(colonnes)}
        totaux = {}
        for c, colonne in enumerate(colonnes):
            if colonne.total == 'somme':
                totaux[c] = sum((Decimal(str(l[c])) for l in tableau.lignes if est_nombre(l[c])), Decimal('0'))

        for c, colonne in enumerate(colonnes):
            proprietes = avec_marge(dict(bold=True, bg_color=VERT_PALE, top=2, top_color=VERT, bottom=1, bottom_color=VERT,
                                         align='left' if c == 0 else ALIGNEMENTS.get(colonne.type, 'left')))
            if c == 0:
                ws.write_string(ligne, c, tableau.libelle_total, self.style(**proprietes))
            elif colonne.total == 'somme':
                total = totaux[c]
                cle = colonne.type + ('_dec' if colonne.type in ('montant', 'quantite') and a_des_decimales(total) else '')
                proprietes['num_format'] = FORMATS.get(cle, FORMATS['montant'])
                ws.write_formula(ligne, c, f"=SUBTOTAL(9,{xl_range(premiere, c, derniere, c)})",
                                 self.style(**proprietes), float(total))
            elif isinstance(colonne.total, tuple):
                _, numerateur, denominateur = colonne.total
                cn, cd = index[numerateur], index[denominateur]
                valeur = float(totaux[cn] / totaux[cd]) if totaux.get(cd) else ''
                cellule_n, cellule_d = xl_rowcol_to_cell(ligne, cn), xl_rowcol_to_cell(ligne, cd)
                proprietes['num_format'] = FORMATS['pourcentage']
                ws.write_formula(ligne, c, f'=IF({cellule_d}=0,"",{cellule_n}/{cellule_d})', self.style(**proprietes), valeur)
            else:
                ws.write_blank(ligne, c, None, self.style(**proprietes))
        ws.set_row(ligne, 20)

    def note(self, ws, ligne, tableau):
        if not tableau.note:
            return ligne
        ws.write_string(ligne, 0, tableau.note, self.style(font_size=9, italic=True, font_color=GRIS))
        return ligne + 1

    def mise_en_page(self, ws, titre, theme, paysage=False, ligne_entete=None, echelle=None, une_page=False):
        ws.hide_gridlines(2)
        ws.set_tab_color(COULEURS_THEMES.get(theme, VERT))
        ws.set_paper(9)  # A4
        if paysage:
            ws.set_landscape()
        if echelle:
            ws.set_print_scale(echelle)
        else:
            ws.fit_to_pages(1, 1 if une_page else 0)
        ws.center_horizontally()
        ws.set_margins(left=0.4, right=0.4, top=0.75, bottom=0.7)
        gris = GRIS.lstrip('#').upper()
        ws.set_header(f"&L&8&K{gris}ALLAKRO — Rapport de gestion&C&8&K{gris}{echapper(titre)}"
                      f"&R&8&K{gris}{echapper(self.p.libelle_periode)}", {'margin': 0.3})
        ws.set_footer(f"&L&8&K{gris}Généré le {self.genere_le:%d/%m/%Y} à {self.genere_le:%H:%M}&R&8&K{gris}Page &P sur &N", {'margin': 0.3})
        if ligne_entete is not None:
            ws.repeat_rows(ligne_entete)
            ws.freeze_panes(ligne_entete + 1, 0)

    # --- Synthèse ---
    def synthese(self, synthese, feuilles):
        ws = self.wb.add_worksheet('Synthèse')
        ws.set_column(0, 0, 2)
        ws.set_column(1, 1, 18)
        ws.set_column(2, 9, 13.5)
        ws.set_column(10, 10, 2)

        ws.set_row(0, 10)
        ws.set_row(1, 36)
        ws.merge_range(1, 1, 1, 9, 'ALLAKRO — Rapport de gestion', self.style(bold=True, font_size=22, font_color=VERT_NUIT))
        ws.set_row(2, 22)
        ws.merge_range(2, 1, 2, 9, f"{self.p.libelle_periode}   ·   {self.p.libelle_perimetre}",
                       self.style(bold=True, font_size=12, font_color=VERT))
        ws.merge_range(3, 1, 3, 9, f"Généré le {self.genere_le:%d/%m/%Y} à {self.genere_le:%H:%M} par {self.auteur}",
                       self.style(font_size=9, italic=True, font_color=GRIS))

        ligne = self.titre_section(ws, 5, 'Indicateurs clés')
        for theme, indicateurs in synthese.groupes:
            couleur = COULEURS_GROUPES.get(theme, VERT)
            ws.merge_range(ligne, 1, ligne + 1, 1, theme, self.style(bold=True, font_size=11, font_color=couleur))
            for i, indicateur in enumerate(indicateurs):
                col = 2 + 2 * i
                ws.merge_range(ligne, col, ligne, col + 1, indicateur.libelle, self.style(
                    font_size=9, font_color=GRIS, align='center', bg_color=CREME,
                    top=5, top_color=couleur, left=1, left_color=LIGNE, right=1, right_color=LIGNE))
                self.valeur_carte(ws, ligne + 1, col, indicateur)
            ws.set_row(ligne, 20)
            ws.set_row(ligne + 1, 32)
            ws.set_row(ligne + 2, 8)
            ligne += 3

        ligne = self.section_categories(ws, ligne + 1, synthese.categories)
        ligne = self.section_evolution(ws, ligne, synthese.evolution)
        ligne = self.sommaire(ws, ligne, feuilles)

        ws.print_area(0, 0, ligne, 10)
        self.mise_en_page(ws, 'Synthèse', 'synthese', une_page=True)
        ws.activate()

    def titre_section(self, ws, ligne, titre):
        ws.merge_range(ligne, 1, ligne, 9, titre, self.style(bold=True, font_size=13, font_color=VERT, bottom=2, bottom_color=VERT))
        ws.set_row(ligne, 24)
        ws.set_row(ligne + 1, 6)
        return ligne + 2

    def valeur_carte(self, ws, ligne, col, indicateur):
        proprietes = dict(bold=True, font_size=14, font_color=VERT_NUIT, align='center', bg_color=CREME,
                          bottom=1, bottom_color=LIGNE, left=1, left_color=LIGNE, right=1, right_color=LIGNE)
        valeur = indicateur.valeur
        if valeur is None:
            ws.merge_range(ligne, col, ligne, col + 1, '—', self.style(**{**proprietes, 'font_color': GRIS_CLAIR}))
            return
        if indicateur.type == 'montant':
            proprietes['num_format'] = '#,##0" FCFA"'
        elif indicateur.type == 'quantite':
            proprietes['num_format'] = '#,##0.0#' if a_des_decimales(valeur) else '#,##0'
        elif indicateur.type == 'entier':
            proprietes['num_format'] = '#,##0'
        elif indicateur.type == 'pourcentage':
            proprietes['num_format'] = FORMATS['pourcentage']
        elif indicateur.type == 'evolution':
            proprietes['num_format'] = FORMATS['evolution']
            # Des dépenses en hausse sont signalées en ocre, en baisse en vert
            proprietes['font_color'] = '#9b5839' if valeur > 0 else ('#3d7a33' if valeur < 0 else VERT_NUIT)
        fmt = self.style(**proprietes)
        ws.merge_range(ligne, col, ligne, col + 1, '', fmt)
        ws.write_number(ligne, col, float(valeur), fmt)

    def entete_mini_tableau(self, ws, ligne, colonnes):
        """En-tête d'un tableau de la synthèse : [(titre, première colonne, dernière colonne, alignement)]."""
        for titre, debut, fin, alignement in colonnes:
            fmt = self.style(**avec_marge(dict(bold=True, font_color=BLANC, bg_color=VERT, align=alignement,
                                               border=1, border_color=VERT)))
            if debut == fin:
                ws.write_string(ligne, debut, titre, fmt)
            else:
                ws.merge_range(ligne, debut, ligne, fin, titre, fmt)
        ws.set_row(ligne, 22)

    def ligne_mini_tableau(self, ws, ligne, libelle, valeurs, bande):
        """Libellé sur B:C puis valeurs typées en D et E."""
        fond = {'bg_color': VERT_BANDE} if bande else {}
        ws.merge_range(ligne, 1, ligne, 2, libelle, self.style_cellule('texte', libelle, **fond))
        for col, (valeur, type_) in zip((3, 4), valeurs):
            self.ecrire(ws, ligne, col, valeur, type_, **fond)

    def ligne_total_mini_tableau(self, ws, ligne, premiere, derniere, total, avec_part=True):
        proprietes = dict(bold=True, bg_color=VERT_PALE, top=2, top_color=VERT, bottom=1, bottom_color=VERT, indent=1)
        ws.merge_range(ligne, 1, ligne, 2, 'Total', self.style(**proprietes, align='left'))
        ws.write_formula(ligne, 3, f"=SUM({xl_range(premiere, 3, derniere, 3)})",
                         self.style(**proprietes, align='right', num_format=FORMATS['montant']), float(total))
        if avec_part:
            ws.write_formula(ligne, 4, f"=SUM({xl_range(premiere, 4, derniere, 4)})",
                             self.style(**proprietes, align='right', num_format=FORMATS['pourcentage']), 1.0 if total else 0)
        else:
            ws.write_blank(ligne, 4, None, self.style(**proprietes))

    def section_categories(self, ws, ligne, categories):
        ligne = self.titre_section(ws, ligne, 'Répartition des dépenses par catégorie')
        debut = ligne
        self.entete_mini_tableau(ws, ligne, [('Catégorie', 1, 2, 'left'), ('Montant (FCFA)', 3, 3, 'right'), ('Part', 4, 4, 'right')])
        ligne += 1
        if not categories:
            ws.merge_range(ligne, 1, ligne, 4, 'Aucune dépense pour cette sélection.',
                           self.style(italic=True, font_color=GRIS, align='center', bottom=1, bottom_color=LIGNE))
            return ligne + 3

        total = sum((montant for _, montant in categories), Decimal('0'))
        premiere = ligne
        for i, (libelle, montant) in enumerate(categories):
            self.ligne_mini_tableau(ws, ligne, libelle, [(montant, 'montant'), (donnees.part(montant, total), 'pourcentage')], i % 2)
            ligne += 1
        derniere = ligne - 1
        self.ligne_total_mini_tableau(ws, ligne, premiere, derniere, total)
        ligne += 1

        # Pourcentages affichés sur l'anneau, sauf pour les très petites parts (illisibles et superposées)
        etiquettes = [None if (donnees.part(montant, total) or 0) >= Decimal('0.04') else {'delete': True}
                      for _, montant in categories]
        graphique = self.wb.add_chart({'type': 'doughnut'})
        graphique.add_series({
            'name': 'Dépenses par catégorie',
            'categories': ['Synthèse', premiere, 1, derniere, 1],
            'values': ['Synthèse', premiere, 3, derniere, 3],
            'data_labels': {'percentage': True, 'custom': etiquettes,
                            'font': {'name': 'Calibri', 'size': 9, 'bold': True, 'color': BLANC}},
            'points': [{'fill': {'color': COULEURS_GRAPHIQUE[i % len(COULEURS_GRAPHIQUE)]}, 'border': {'color': BLANC}}
                       for i in range(len(categories))],
        })
        graphique.set_hole_size(50)
        graphique.set_title({'none': True})
        graphique.set_legend({'position': 'right', 'font': {'name': 'Calibri', 'size': 9, 'color': TEXTE}})
        graphique.set_chartarea({'border': {'none': True}, 'fill': {'none': True}})
        graphique.set_size({'width': 480, 'height': 270})
        ws.insert_chart(debut, 5, graphique, {'x_offset': 14, 'y_offset': 0, 'object_position': 1})
        return max(ligne, debut + 14) + 1

    def section_evolution(self, ws, ligne, evolution):
        ligne = self.titre_section(ws, ligne, 'Évolution des dépenses sur six mois')
        debut = ligne
        self.entete_mini_tableau(ws, ligne, [('Mois', 1, 2, 'left'), ('Montant (FCFA)', 3, 3, 'right'), ('Variation', 4, 4, 'right')])
        ligne += 1
        premiere = ligne
        precedent = None
        for i, (libelle, montant) in enumerate(evolution):
            variation = donnees.part(montant - precedent, precedent) if precedent is not None else None
            self.ligne_mini_tableau(ws, ligne, libelle, [(montant, 'montant'), (variation, 'evolution')], i % 2)
            precedent = montant
            ligne += 1
        derniere = ligne - 1
        total = sum((montant for _, montant in evolution), Decimal('0'))
        self.ligne_total_mini_tableau(ws, ligne, premiere, derniere, total, avec_part=False)
        ligne += 1

        if total:
            graphique = self.wb.add_chart({'type': 'column'})
            graphique.add_series({
                'name': 'Dépenses',
                'categories': ['Synthèse', premiere, 1, derniere, 1],
                'values': ['Synthèse', premiere, 3, derniere, 3],
                'fill': {'color': VERT}, 'border': {'none': True}, 'gap': 70,
                'data_labels': {'value': True, 'num_format': '#,##0', 'font': {'name': 'Calibri', 'size': 8, 'color': GRIS}},
            })
            graphique.set_title({'none': True})
            graphique.set_legend({'none': True})
            graphique.set_y_axis({'num_format': '#,##0', 'num_font': {'name': 'Calibri', 'size': 8, 'color': GRIS},
                                  'line': {'none': True}, 'major_gridlines': {'visible': True, 'line': {'color': LIGNE}}})
            graphique.set_x_axis({'num_font': {'name': 'Calibri', 'size': 9, 'color': TEXTE}, 'line': {'color': GRIS_CLAIR}})
            graphique.set_chartarea({'border': {'none': True}, 'fill': {'none': True}})
            graphique.set_plotarea({'border': {'none': True}})
            graphique.set_size({'width': 480, 'height': 230})
            ws.insert_chart(debut, 5, graphique, {'x_offset': 14, 'y_offset': 0, 'object_position': 1})
        return max(ligne, debut + 12) + 1

    def sommaire(self, ws, ligne, feuilles):
        ligne = self.titre_section(ws, ligne, 'Contenu du classeur')
        self.entete_mini_tableau(ws, ligne, [('Feuille', 1, 2, 'left'), ('Contenu', 3, 8, 'left'), ('Lignes', 9, 9, 'right')])
        ligne += 1
        for i, feuille in enumerate(feuilles):
            commun = {'bottom': 1, 'bottom_color': LIGNE, 'indent': 1, **({'bg_color': VERT_BANDE} if i % 2 else {})}
            lien = self.style(font_color=VERT, underline=1, bold=True, **commun)
            ws.merge_range(ligne, 1, ligne, 2, '', lien)
            ws.write_url(ligne, 1, f"internal:'{feuille.nom}'!A1", lien, string=feuille.nom)
            ws.merge_range(ligne, 3, ligne, 8, feuille.description, self.style(text_wrap=True, **commun))
            if len(feuille.tableaux) == 1:
                ws.write_number(ligne, 9, feuille.nb_lignes, self.style(align='right', num_format='#,##0', **commun))
            else:
                ws.write_string(ligne, 9, '—', self.style(align='right', font_color=GRIS_CLAIR, **commun))
            # Excel n'ajuste pas la hauteur des cellules fusionnées : on la fixe (une ligne de texte, deux au-delà)
            ws.set_row(ligne, 21 if len(feuille.description) <= 105 else 34)
            ligne += 1
        return ligne


def generer_classeur(perimetre, utilisateur):
    """Construit le rapport de gestion (synthèse + une feuille par thème) et renvoie le contenu du fichier .xlsx."""
    feuilles = donnees.feuilles(perimetre, avec_journal=getattr(utilisateur, 'is_big_boss', False))
    resume = donnees.synthese(perimetre)

    tampon = io.BytesIO()
    classeur = xlsxwriter.Workbook(tampon, {
        'in_memory': True,
        # Les textes saisis restent du texte : jamais interprétés comme formules, liens ou nombres
        'strings_to_formulas': False, 'strings_to_urls': False, 'strings_to_numbers': False,
    })
    classeur.set_properties({
        'title': f"Rapport de gestion ALLAKRO — {perimetre.libelle_periode}",
        'subject': perimetre.libelle_perimetre,
        'author': utilisateur.nom_complet,
        'company': 'ALLAKRO',
    })
    rapport = RapportExcel(classeur, perimetre, utilisateur)
    rapport.synthese(resume, feuilles)
    for feuille in feuilles:
        rapport.feuille(feuille)
    classeur.close()
    return tampon.getvalue()
