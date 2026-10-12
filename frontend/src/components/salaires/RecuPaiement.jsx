import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { formatDate, formatFCFA, formatPeriode, montantEnLettres } from '@/utils/format';
import { TYPE_PAIEMENT_LABELS } from '@/constants';

function Ligne({ libelle, children }) {
  return (
    <div className="recu-ligne">
      <span>{libelle}</span>
      <span>{children}</span>
    </div>
  );
}

const jourHeure = () => {
  const maintenant = new Date();
  return `${maintenant.toLocaleDateString('fr-FR')} à ${maintenant.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
};

const initiales = (nom) => (nom || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((m) => m[0].toUpperCase()).join('');

function Feuille() {
  return (
    <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M7 20h10" />
      <path d="M10 20c5.5-2.5.8-6.4 3-10" />
      <path d="M9.5 9.4c1.1.8 1.8 2.2 2.3 3.6-2.4.3-4.3-.4-5.5-2.3-1-1.7-.6-3.7.7-4.8.9 1.8 2 2.6 2.5 3.5Z" />
      <path d="M14.1 6a3.4 3.4 0 0 1 5-1.4c0 1.5-.8 2.7-2 3.3-1.5.8-3.2.7-3-1.9Z" />
    </svg>
  );
}

/**
 * Reçu d'un paiement de rémunération : même composant pour l'aperçu à l'écran et pour l'impression, afin que
 * l'aperçu soit exactement ce qui sort sur papier. Le style (classes `recu-*`, index.css) ne dépend ni du thème
 * ni de la taille de l'écran : feuille blanche, texte foncé.
 * paiement : un paiement tel que renvoyé par l'API (`paiements-salaire/`).
 */
export default function RecuPaiement({ paiement: p }) {
  const travail = Boolean(p.activite);
  const periode = travail
    ? `du ${formatDate(p.periode_debut)} au ${formatDate(p.periode_fin)}`
    : formatPeriode(p.periode);
  const reste = Number(p.reste_apres) || 0;
  const du = Number(p.montant_du) || 0;
  const paye = Number(p.total_paye) || 0;
  const avancement = du > 0 ? Math.min(100, Math.round((paye / du) * 100)) : 0;
  const role = p.equipe_nom && (p.via_chef ? `Chef de l'équipe « ${p.equipe_nom} »` : `Membre de l'équipe « ${p.equipe_nom} »`);
  const annule = Boolean(p.annule);
  const etat = annule ? { classe: 'recu-etat--annule', texte: 'Annulé' }
    : reste > 0 ? { classe: 'recu-etat--acompte', texte: p.est_avance ? 'Avance' : 'Acompte' }
      : { classe: 'recu-etat--solde', texte: 'Soldé' };

  return (
    <article className={`recu ${annule ? 'recu--annule' : reste <= 0 ? 'recu--solde' : ''}`} aria-label={`Reçu de paiement ${p.numero}`}>
      <header className="recu-bandeau">
        <div className="recu-marque-bloc">
          <span className="recu-logo"><Feuille /></span>
          <div>
            <div className="recu-marque">ALLAKRO</div>
            <div className="recu-sous-marque">Gestion des plantations</div>
          </div>
        </div>
        <div className="recu-titre">
          <strong>{p.est_avance ? "REÇU D'AVANCE" : 'REÇU DE PAIEMENT'}</strong>
          <span className="recu-numero">N° {p.numero}</span>
        </div>
      </header>

      {annule && (
        <div className="recu-alerte" role="status">
          Paiement annulé{p.date_annulation ? ` le ${formatDate(p.date_annulation)}` : ''}{p.motif_annulation ? ` — ${p.motif_annulation}` : ''} :
          ce reçu n'a plus valeur de paiement.
        </div>
      )}

      <div className="recu-corps">
        <section className="recu-montant">
          <div className="recu-montant-tete">
            <small>{p.est_avance ? 'Avance versée' : 'Montant payé'}</small>
            <span className={`recu-etat ${etat.classe}`}>{etat.texte}</span>
          </div>
          <strong>{formatFCFA(p.montant)}</strong>
          <em className="recu-lettres">Arrêté à la somme de : {montantEnLettres(p.montant)}</em>
          <div className="recu-puces">
            <span>{formatDate(p.date)}</span>
            <span>{TYPE_PAIEMENT_LABELS[p.type_paiement] || p.type_paiement}</span>
            {p.reference && <span>Réf. {p.reference}</span>}
          </div>
        </section>

        {p.via_chef && p.equipe_nom && (
          <div className="recu-mention">
            Paiement effectué via le chef d'équipe : {p.beneficiaire_nom} reçoit le montant pour toute l'équipe « {p.equipe_nom} ».
          </div>
        )}

        <div className="recu-deux">
          <section className="recu-carte">
            <h4>Bénéficiaire</h4>
            <div className="recu-personne">
              <span className="recu-avatar" aria-hidden="true">{initiales(p.beneficiaire_nom)}</span>
              <div>
                <div className="recu-nom">{p.beneficiaire_nom}</div>
                <div className="recu-matricule">{p.beneficiaire_matricule}</div>
              </div>
            </div>
            {role && <div className="recu-role">{role}</div>}
          </section>
          <section className="recu-carte">
            <h4>Rémunération concernée</h4>
            <Ligne libelle="Période">{periode}</Ligne>
            {travail ? <Ligne libelle="Activité">{p.activite}</Ligne> : <Ligne libelle="Libellé">{p.salaire_libelle}</Ligne>}
            <Ligne libelle="Bloc">{[p.bloc_code, p.campement_nom].filter(Boolean).join(' · ') || '—'}</Ligne>
          </section>
        </div>

        <section className="recu-situation">
          <h4>Situation après ce paiement</h4>
          <div className="recu-chiffres">
            <div><small>Rémunération (net)</small><strong>{formatFCFA(du)}</strong></div>
            <div><small>Total payé</small><strong>{formatFCFA(paye)}</strong></div>
            <div className={reste > 0 ? 'recu-reste' : 'recu-solde'}>
              <small>Reste à payer</small><strong>{reste > 0 ? formatFCFA(reste) : 'Soldé'}</strong>
            </div>
          </div>
          <div className="recu-barre" role="img" aria-label={`${avancement} % payé`}><span style={{ width: `${avancement}%` }} /></div>
          <div className="recu-barre-legende">{avancement} % de la rémunération payée</div>
        </section>

        {p.observation && (
          <section className="recu-observation">
            <h4>Observation</h4>
            <p>{p.observation}</p>
          </section>
        )}

        <div className="recu-signatures">
          <div className="recu-signature"><span>Signature du bénéficiaire</span></div>
          <div className="recu-signature"><span>Signature et cachet ALLAKRO</span></div>
        </div>
      </div>

      <footer className="recu-pied">
        <span>Reçu généré le {jourHeure()} — application ALLAKRO</span>
        <span className="recu-numero-pied">{p.numero}</span>
      </footer>
    </article>
  );
}

/**
 * Ouvre la boîte d'impression du navigateur avec le seul reçu (aucun menu, bouton ni fenêtre) :
 * le reçu est dessiné hors de l'application (#zone-impression, visible uniquement à l'impression, voir index.css).
 */
export function imprimerRecu(paiement) {
  document.getElementById('zone-impression')?.remove();
  const zone = document.createElement('div');
  zone.id = 'zone-impression';
  document.body.appendChild(zone);
  const racine = createRoot(zone);
  flushSync(() => racine.render(<RecuPaiement paiement={paiement} />));
  const nettoyer = () => {
    window.removeEventListener('afterprint', nettoyer);
    racine.unmount();
    zone.remove();
  };
  window.addEventListener('afterprint', nettoyer);
  window.print();
}
