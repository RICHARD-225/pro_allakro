import { useState } from 'react';
import { Modal, Input, Button } from '@/components/ui';
import { useToast } from '@/contexts/ToastContext';
import { utilisateursService } from '@/services';
import { showServerErrors } from '@/utils/errors';
import { ROLE } from '@/constants';

const VIDE = { prenom: '', nom_personne: '', telephone: '', email: '', password: '' };

/**
 * Crée un compte superviseur sans quitter le formulaire d'un campement. Le compte naît sans campement ; c'est le campement en cours
 * de création (ou de modification) qui le désigne ensuite comme responsable. onCree reçoit { id (fiche), prenom, nom, matricule }.
 */
export default function NouveauResponsableModal({ open, onClose, onCree }) {
  const toast = useToast();
  const [form, setForm] = useState(VIDE);
  const [erreurs, setErreurs] = useState({});
  const [enCours, setEnCours] = useState(false);

  const fermer = () => { setForm(VIDE); setErreurs({}); onClose(); };

  const valider = () => {
    const e = {};
    if (!form.prenom.trim()) e.prenom = 'Le prénom est obligatoire';
    if (!form.nom_personne.trim()) e.nom_personne = 'Le nom est obligatoire';
    if (!form.email.trim()) e.email = "L'e-mail est obligatoire";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = 'E-mail invalide';
    if (form.password.length < 10) e.password = 'Au moins 10 caractères (majuscule, minuscule et chiffre)';
    setErreurs(e);
    return Object.keys(e).length === 0;
  };

  const enregistrer = async () => {
    if (!valider()) return;
    setEnCours(true);
    try {
      const compte = await utilisateursService.create({
        prenom: form.prenom.trim(), nom_personne: form.nom_personne.trim(), telephone: form.telephone.trim(),
        email: form.email.trim().toLowerCase(), role: ROLE.SUPERVISOR, password: form.password,
      });
      toast.success(`Compte créé pour ${compte.nom}`);
      onCree({ id: compte.personne_id, nom: compte.nom });
      fermer();
    } catch (err) {
      showServerErrors(err, { setFormErrors: setErreurs, toast });
    } finally {
      setEnCours(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={fermer}
      title="Nouveau responsable"
      size="sm"
      footer={(
        <>
          <Button variant="outline" onClick={fermer}>Annuler</Button>
          <Button onClick={enregistrer} loading={enCours}>Créer le compte</Button>
        </>
      )}
    >
      <div className="space-y-4">
        <p className="text-sm text-ink-600">Un compte superviseur est créé. Il gérera ce campement et tous ses blocs.</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Input label="Prénom" required value={form.prenom} onChange={(e) => setForm({ ...form, prenom: e.target.value })} error={erreurs.prenom} />
          <Input label="Nom" required value={form.nom_personne} onChange={(e) => setForm({ ...form, nom_personne: e.target.value })} error={erreurs.nom_personne} />
        </div>
        <Input label="Téléphone" type="tel" placeholder="Ex: 07 00 00 00 00" value={form.telephone}
          onChange={(e) => setForm({ ...form, telephone: e.target.value })} error={erreurs.telephone} hint="Facultatif." />
        <Input label="E-mail (identifiant de connexion)" required type="email" value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })} error={erreurs.email} />
        <Input label="Mot de passe" required type="password" autoComplete="new-password" value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })} error={erreurs.password}
          hint="10 caractères minimum, avec majuscule, minuscule et chiffre" />
      </div>
    </Modal>
  );
}
