import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Lock, Eye, EyeOff, ArrowLeft, KeyRound, AlertCircle } from 'lucide-react';
import Button from '@/components/ui/Button';
import { authApi } from '@/api/auth';
import { useToast } from '@/contexts/ToastContext';

// Étape 2 : lien reçu par e-mail (?token=…) → nouveau mot de passe. Le jeton est retiré de l'adresse affichée dès qu'il est lu.
export default function ReinitialiserMotDePassePage() {
  const toast = useToast();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [jeton] = useState(() => params.get('token') || '');
  const [etat, setEtat] = useState('verification'); // verification · valide · invalide
  const [motDePasse, setMotDePasse] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [voir, setVoir] = useState(false);
  const [erreurs, setErreurs] = useState({});
  const [chargement, setChargement] = useState(false);

  useEffect(() => {
    window.history.replaceState(null, '', window.location.pathname);
    if (!jeton) {
      setEtat('invalide');
      return;
    }
    authApi.verifierLien(jeton).then((r) => setEtat(r.valide ? 'valide' : 'invalide')).catch(() => setEtat('invalide'));
  }, [jeton]);

  const valider = async (e) => {
    e.preventDefault();
    setErreurs({});
    setChargement(true);
    try {
      await authApi.reinitialiser({ token: jeton, nouveau_mot_de_passe: motDePasse, confirmation });
      toast.success('Mot de passe modifié. Vous pouvez vous connecter.');
      navigate('/login', { replace: true });
    } catch (err) {
      if (err.status === 400 && err.fields && Object.keys(err.fields).length) setErreurs(err.fields);
      else if (err.status === 400) setEtat('invalide');
      else toast.error(err.message);
    } finally {
      setChargement(false);
    }
  };

  if (etat === 'verification') return <p className="text-sm text-ink-500">Vérification du lien…</p>;

  if (etat === 'invalide') {
    return (
      <div className="animate-fade-in-up space-y-4">
        <h2 className="text-xl font-bold text-ink-800">Lien invalide ou expiré</h2>
        <div className="flex items-start gap-3 rounded-lg border border-earth-200 bg-earth-50 p-4 text-sm text-earth-700" role="alert">
          <AlertCircle size={18} className="mt-0.5 shrink-0" />
          <p>Ce lien n'est plus valable (il ne sert qu'une fois et expire au bout de 30 minutes). Faites une nouvelle demande.</p>
        </div>
        <Link to="/mot-de-passe-oublie" className="inline-flex items-center gap-1.5 text-sm font-medium text-forest-700 hover:underline">
          <KeyRound size={14} /> Demander un nouveau lien
        </Link>
      </div>
    );
  }

  return (
    <div className="animate-fade-in-up">
      <h2 className="text-xl font-bold text-ink-800 mb-1">Nouveau mot de passe</h2>
      <p className="text-sm text-ink-500 mb-6">10 caractères au minimum, avec une minuscule, une majuscule et un chiffre.</p>
      <form onSubmit={valider} className="space-y-4">
        <div>
          <label htmlFor="nouveau" className="label-base">Nouveau mot de passe</label>
          <div className="relative">
            <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
            <input id="nouveau" type={voir ? 'text' : 'password'} required autoComplete="new-password" value={motDePasse}
              onChange={(e) => { setMotDePasse(e.target.value); setErreurs((x) => ({ ...x, nouveau_mot_de_passe: '' })); }}
              className="input-base pl-9 pr-9" aria-invalid={!!erreurs.nouveau_mot_de_passe} />
            <button type="button" onClick={() => setVoir((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-400 hover:text-ink-600"
              aria-label={voir ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}>
              {voir ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          {erreurs.nouveau_mot_de_passe && <p className="mt-1 text-xs text-earth-600">{erreurs.nouveau_mot_de_passe}</p>}
        </div>
        <div>
          <label htmlFor="confirmation" className="label-base">Confirmation</label>
          <div className="relative">
            <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
            <input id="confirmation" type={voir ? 'text' : 'password'} required autoComplete="new-password" value={confirmation}
              onChange={(e) => { setConfirmation(e.target.value); setErreurs((x) => ({ ...x, confirmation: '' })); }}
              className="input-base pl-9" aria-invalid={!!erreurs.confirmation} />
          </div>
          {erreurs.confirmation && <p className="mt-1 text-xs text-earth-600">{erreurs.confirmation}</p>}
        </div>
        <Button type="submit" className="w-full" size="lg" loading={chargement}>Enregistrer le mot de passe</Button>
        <Link to="/login" className="inline-flex items-center gap-1.5 text-sm font-medium text-forest-700 hover:underline">
          <ArrowLeft size={14} /> Retour à la connexion
        </Link>
      </form>
    </div>
  );
}
