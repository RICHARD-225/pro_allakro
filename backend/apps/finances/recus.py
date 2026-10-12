"""
Reçus numériques (PDF A4) aux couleurs ALLAKRO :
- reçu de paiement d'une rémunération (avec la mention « Paiement effectué via le chef d'équipe » si besoin) ;
- reçu d'achat aux particuliers.
Les polices Vera (fournies avec ReportLab) affichent les accents sur tous les systèmes.
"""
import io
import os
from decimal import Decimal

import reportlab
from django.db.models import Sum
from django.utils import timezone
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import KeepTogether, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from apps.core.utils import montant_en_lettres

from .calculs import STATUTS_REMUNERATION, situation_au_paiement, statut_paiement, statut_remuneration

VERT_NUIT = colors.HexColor('#1c3a27')
VERT = colors.HexColor('#2f6142')
VERT_CLAIR = colors.HexColor('#dceee0')
VERT_PALE = colors.HexColor('#f0f7f2')
OLIVE_PALE = colors.HexColor('#f3f1d2')
OLIVE = colors.HexColor('#5e561e')
GRIS = colors.HexColor('#697069')
LIGNE = colors.HexColor('#d0d4d0')
ROUGE = colors.HexColor('#b3382c')
TEXTE = colors.HexColor('#383b38')

_POLICES = os.path.join(os.path.dirname(reportlab.__file__), 'fonts')
for _nom, _fichier in (('Vera', 'Vera.ttf'), ('Vera-Bold', 'VeraBd.ttf'), ('Vera-Italic', 'VeraIt.ttf')):
    if _nom not in pdfmetrics.getRegisteredFontNames():
        pdfmetrics.registerFont(TTFont(_nom, os.path.join(_POLICES, _fichier)))

MODES = {'ESPECES': 'Espèces', 'MOBILE_MONEY': 'Mobile Money', 'VIREMENT': 'Virement', 'AUTRE': 'Autre'}
STATUTS_ACHAT = {'NON_PAYEE': 'Non payé', 'PARTIELLE': 'Partiellement payé', 'PAYEE': 'Payé'}

STYLE_TEXTE = ParagraphStyle('texte', fontName='Vera', fontSize=9, leading=11, textColor=TEXTE)
STYLE_LIBELLE = ParagraphStyle('libelle', parent=STYLE_TEXTE, textColor=GRIS, fontSize=8.5)
STYLE_VALEUR = ParagraphStyle('valeur', parent=STYLE_TEXTE, fontName='Vera-Bold')
STYLE_SECTION = ParagraphStyle('section', fontName='Vera-Bold', fontSize=10.5, leading=13, textColor=VERT, spaceBefore=2)
STYLE_MONTANT = ParagraphStyle('montant', fontName='Vera-Bold', fontSize=20, leading=23, textColor=VERT_NUIT)
STYLE_PETIT = ParagraphStyle('petit', parent=STYLE_TEXTE, fontSize=8, leading=10, textColor=GRIS)
STYLE_MENTION = ParagraphStyle('mention', parent=STYLE_TEXTE, fontName='Vera-Bold', textColor=OLIVE, alignment=TA_CENTER)
STYLE_SIGNATURE = ParagraphStyle('signature', parent=STYLE_PETIT, alignment=TA_CENTER)
STYLE_DROITE = ParagraphStyle('droite', parent=STYLE_VALEUR, alignment=TA_RIGHT)

LARGEUR = A4[0] - 36 * mm


def fcfa(valeur):
    valeur = Decimal(valeur or 0)
    texte = f"{valeur:,.2f}" if valeur != valeur.to_integral_value() else f"{valeur:,.0f}"
    return texte.replace(',', ' ').replace('.', ',') + ' FCFA'


def nombre(valeur):
    valeur = Decimal(valeur or 0).normalize()
    return f"{valeur:f}".replace('.', ',')


def date_fr(valeur):
    return valeur.strftime('%d/%m/%Y') if valeur else '—'


def echapper(texte):
    return str(texte if texte not in (None, '') else '—').replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')


def section(titre, lignes):
    """Bloc « libellé / valeur » sur deux colonnes, sous un titre de section."""
    donnees = [[Paragraph(echapper(libelle), STYLE_LIBELLE), Paragraph(echapper(valeur), STYLE_VALEUR)] for libelle, valeur in lignes]
    tableau = Table(donnees, colWidths=[LARGEUR * 0.36, LARGEUR * 0.64])
    tableau.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('LINEBELOW', (0, 0), (-1, -1), 0.4, LIGNE),
        ('TOPPADDING', (0, 0), (-1, -1), 2.5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 2.5),
        ('LEFTPADDING', (0, 0), (-1, -1), 6),
    ]))
    return KeepTogether([Paragraph(titre, STYLE_SECTION), Spacer(1, 1.5 * mm), tableau, Spacer(1, 3.5 * mm)])


def encadre_montant(libelle, montant, details):
    contenu = [[Paragraph(libelle, STYLE_LIBELLE)], [Paragraph(fcfa(montant), STYLE_MONTANT)], [Paragraph(details, STYLE_TEXTE)]]
    tableau = Table(contenu, colWidths=[LARGEUR])
    tableau.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), VERT_PALE),
        ('BOX', (0, 0), (-1, -1), 0.8, VERT_CLAIR),
        ('LINEBEFORE', (0, 0), (0, -1), 4, VERT),
        ('LEFTPADDING', (0, 0), (-1, -1), 12),
        ('TOPPADDING', (0, 0), (-1, 0), 8),
        ('BOTTOMPADDING', (0, -1), (-1, -1), 8),
    ]))
    return tableau


def mention(texte):
    tableau = Table([[Paragraph(texte, STYLE_MENTION)]], colWidths=[LARGEUR])
    tableau.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), OLIVE_PALE),
        ('BOX', (0, 0), (-1, -1), 0.8, colors.HexColor('#c8c45e')),
        ('TOPPADDING', (0, 0), (-1, -1), 6), ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
    ]))
    return tableau


def signatures(gauche, droite):
    case = lambda titre: [Spacer(1, 10 * mm), Paragraph(titre, STYLE_SIGNATURE)]  # noqa: E731
    tableau = Table([[case(gauche), case(droite)]], colWidths=[LARGEUR / 2 - 4 * mm, LARGEUR / 2 - 4 * mm],
                    hAlign='CENTER', spaceBefore=3 * mm)
    tableau.setStyle(TableStyle([
        ('BOX', (0, 0), (0, 0), 0.6, LIGNE), ('BOX', (1, 0), (1, 0), 0.6, LIGNE),
        ('VALIGN', (0, 0), (-1, -1), 'BOTTOM'), ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
    ]))
    return tableau


def construire(titre, numero, elements, emis_par, filigrane=None):
    """Mise en page commune : bandeau vert, numéro, contenu, pied de page ; `filigrane` = (texte, couleur) en diagonale."""
    tampon = io.BytesIO()
    genere_le = timezone.localtime()

    def decor(canvas, doc):
        largeur, hauteur = A4
        if filigrane:
            texte, couleur = filigrane
            canvas.saveState()
            canvas.setFillColor(couleur)
            canvas.setFillAlpha(0.13)
            canvas.setFont('Vera-Bold', 120)
            canvas.translate(largeur / 2, hauteur / 2 - 10 * mm)
            canvas.rotate(35)
            canvas.drawCentredString(0, 0, texte)
            canvas.restoreState()
        canvas.saveState()
        canvas.setFillColor(VERT)
        canvas.rect(0, hauteur - 34 * mm, largeur, 34 * mm, stroke=0, fill=1)
        canvas.setFillColor(VERT_NUIT)
        canvas.rect(0, hauteur - 36 * mm, largeur, 2 * mm, stroke=0, fill=1)
        canvas.setFillColor(colors.white)
        canvas.setFont('Vera-Bold', 22)
        canvas.drawString(18 * mm, hauteur - 17 * mm, 'ALLAKRO')
        canvas.setFont('Vera', 9)
        canvas.setFillColor(VERT_CLAIR)
        canvas.drawString(18 * mm, hauteur - 24 * mm, 'Gestion des plantations')
        canvas.setFillColor(colors.white)
        canvas.setFont('Vera-Bold', 13)
        canvas.drawRightString(largeur - 18 * mm, hauteur - 16 * mm, titre)
        canvas.setFont('Vera', 10)
        canvas.drawRightString(largeur - 18 * mm, hauteur - 23 * mm, f"N° {numero}")
        canvas.setFillColor(GRIS)
        canvas.setFont('Vera', 7.5)
        canvas.drawString(18 * mm, 12 * mm, f"Reçu généré le {genere_le:%d/%m/%Y} à {genere_le:%H:%M} par {emis_par} — application ALLAKRO")
        canvas.drawRightString(largeur - 18 * mm, 12 * mm, f"Page {doc.page}")
        canvas.setStrokeColor(LIGNE)
        canvas.line(18 * mm, 16 * mm, largeur - 18 * mm, 16 * mm)
        canvas.restoreState()

    document = SimpleDocTemplate(tampon, pagesize=A4, leftMargin=18 * mm, rightMargin=18 * mm, topMargin=42 * mm,
                                 bottomMargin=22 * mm, title=f"{titre.capitalize()} {numero}", author='ALLAKRO')
    document.build(elements, onFirstPage=decor, onLaterPages=decor)
    return tampon.getvalue()


def _nom_utilisateur(utilisateur):
    return getattr(utilisateur, 'nom_complet', None) or 'ALLAKRO'


def recu_paiement(paiement, utilisateur=None):
    salaire = paiement.salaire
    travail = salaire.travail
    beneficiaire = paiement.beneficiaire or salaire.personne
    bloc = salaire.bloc or (travail.bloc if travail else None)
    campement = bloc.campement if bloc else salaire.personne.campement
    # Situation juste après CE paiement (le reçu reste exact même si d'autres paiements suivent)
    situation = situation_au_paiement(paiement)
    total_paye, reste = situation['paye'], situation['reste']
    avances = salaire.paiements.filter(est_avance=True, annule=False).aggregate(total=Sum('montant'))['total'] or Decimal('0')
    statut = STATUTS_REMUNERATION[statut_remuneration(salaire, total_paye)]
    participants = travail.participants_actuels() if travail else []
    en_equipe = bool(travail and travail.equipe_id and len(participants) > 1)
    role = next((p.get_role_lors_du_travail_display() for p in participants if p.personne_id == beneficiaire.pk), 'Titulaire')

    nature = 'Avance' if paiement.est_avance else 'Paiement'
    details = f"{nature} du {date_fr(paiement.date_paiement)} · Mode : {MODES.get(paiement.type_paiement, paiement.type_paiement)}"
    if paiement.reference:
        details += f" · Référence : {echapper(paiement.reference)}"
    details += f"<br/>Arrêté à la somme de : {montant_en_lettres(paiement.montant)}"
    if paiement.observation:
        details += f"<br/>Observation : {echapper(paiement.observation)}"
    elements = []
    if paiement.annule:
        quand = timezone.localtime(paiement.date_annulation).strftime('%d/%m/%Y') if paiement.date_annulation else ''
        motif = f" — {echapper(paiement.motif_annulation)}" if paiement.motif_annulation else ''
        elements += [mention(f"PAIEMENT ANNULÉ le {quand}{motif} : ce reçu n'a plus de valeur de paiement."), Spacer(1, 3 * mm)]
    elements += [encadre_montant('Avance versée' if paiement.est_avance else 'Montant payé', paiement.montant, details),
                 Spacer(1, 3 * mm)]
    if en_equipe and beneficiaire.pk == salaire.personne_id:
        elements += [mention(f"Paiement effectué via le chef d'équipe : {echapper(beneficiaire.nom_complet)} reçoit le montant "
                             f"pour toute l'équipe « {echapper(travail.equipe.nom)} »."), Spacer(1, 3 * mm)]
    elif en_equipe:
        elements += [mention(f"Paiement effectué via un membre de l'équipe : {echapper(beneficiaire.nom_complet)} reçoit le "
                             f"montant pour l'équipe « {echapper(travail.equipe.nom)} »."), Spacer(1, 3 * mm)]

    elements.append(section('Bénéficiaire du paiement', [
        ('Nom', beneficiaire.nom_complet), ('Matricule', beneficiaire.matricule),
        ('Téléphone', beneficiaire.telephone), ('Rôle', role),
    ]))
    if travail:
        elements.append(section('Travail', [
            ('Activité', travail.activite_libelle),
            ('Plantation', campement.plantation.nom if campement else None),
            ('Campement', campement.nom if campement else None),
            ('Bloc', f"{bloc.code} — {bloc.nom}" if bloc else None),
            ('Période', f"du {date_fr(travail.date_travail)} au {date_fr(travail.date_fin)}"),
            ('Quantité', f"{nombre(travail.quantite)} {travail.unite}"),
            ('Prix unitaire', fcfa(travail.prix_unitaire)),
        ]))
        if travail.equipe_id:
            elements.append(section('Équipe', [
                ("Nom de l'équipe", travail.equipe.nom),
                ("Chef d'équipe", salaire.personne.nom_complet),
                ('Personnes concernées', ', '.join(p.personne.nom_complet for p in participants)),
            ]))
        else:
            elements.append(section('Personne concernée', [('Responsable du travail', salaire.personne.nom_complet)]))
    else:
        elements.append(section('Rémunération', [
            ('Libellé', salaire.libelle), ('Personne rémunérée', salaire.personne.nom_complet),
            ('Période', salaire.date_debut.strftime('%m/%Y')),
            ('Plantation', campement.plantation.nom if campement else None), ('Campement', campement.nom if campement else None),
            ('Bloc', f"{bloc.code} — {bloc.nom}" if bloc else None), ('Montant brut', fcfa(salaire.montant_brut)),
        ]))
    lignes = [('Montant brut', fcfa(salaire.montant_brut))]
    if salaire.montant_ponction:
        lignes.append(('Ponction', fcfa(salaire.montant_ponction)))
    lignes += [
        ('Net à payer', fcfa(salaire.montant_net)),
        ('Avance(s) versée(s)', fcfa(avances) if avances else 'Aucune'),
        ('Montant de ce paiement', fcfa(paiement.montant)),
        ('Total payé (ce paiement compris)', fcfa(total_paye)),
        ('Reste à payer', fcfa(reste)),
        ('Statut', statut),
    ]
    elements.append(section('Situation de la rémunération', lignes))
    elements.append(signatures('Signature du bénéficiaire', 'Signature et cachet ALLAKRO'))
    # Filigrane : « ANNULÉ » pour un paiement annulé, « PAYÉ » quand ce paiement solde la rémunération
    filigrane = ('ANNULÉ', ROUGE) if paiement.annule else (('PAYÉ', VERT) if reste <= 0 else None)
    return construire('REÇU DE PAIEMENT', paiement.numero, elements, _nom_utilisateur(utilisateur), filigrane)


def recu_achat(achat, utilisateur=None):
    paye = achat.paiements.aggregate(total=Sum('montant'))['total'] or Decimal('0')
    reste = max(achat.montant_total - paye, Decimal('0'))
    vendeur = achat.particulier
    bloc = achat.bloc
    campement = bloc.campement if bloc else achat.campement
    reglements = list(achat.paiements.order_by('date_paiement', 'id'))

    details = f"Achat du {date_fr(achat.date_achat)} · {nombre(achat.poids)} {achat.unite_poids} × {fcfa(achat.prix_unitaire)}"
    elements = [encadre_montant("Montant de l'achat", achat.montant_total, details), Spacer(1, 5 * mm)]
    elements.append(section('Vendeur (fournisseur)', [
        ('Nom', str(vendeur)), ('Téléphone', vendeur.telephone), ('Adresse', vendeur.adresse),
    ]))
    elements.append(section('Achat', [
        ('Produit', achat.designation), ('Date', date_fr(achat.date_achat)),
        ('Quantité', f"{nombre(achat.poids)} {achat.unite_poids}"), ('Prix unitaire', fcfa(achat.prix_unitaire)),
        ('Montant', fcfa(achat.montant_total)),
        ('Plantation', campement.plantation.nom if campement else None),
        ('Campement', campement.nom if campement else None),
        ('Bloc', f"{bloc.code} — {bloc.nom}" if bloc else None),
    ]))
    lignes = [(f"Règlement du {date_fr(r.date_paiement)} ({MODES.get(r.type_paiement, r.type_paiement)})", fcfa(r.montant))
              for r in reglements]
    lignes += [('Total payé', fcfa(paye)), ('Reste à payer', fcfa(reste)),
               ('Statut', STATUTS_ACHAT[statut_paiement(achat.montant_total, paye)])]
    elements.append(section('Règlement du vendeur', lignes))
    elements.append(signatures('Signature du vendeur', 'Signature et cachet ALLAKRO'))
    return construire("REÇU D'ACHAT", achat.reference, elements, _nom_utilisateur(utilisateur),
                      ('PAYÉ', VERT) if reste <= 0 else None)
