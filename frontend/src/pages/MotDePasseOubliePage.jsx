import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, ArrowLeft, Send, CheckCircle2 } from 'lucide-react';
import Button from '@/components/ui/Button';
import { authApi } from '@/api/auth';
import { showServerErrors } from '@/utils/errors';
import { useToast } from '@/contexts/ToastContext';

// Étape 1 : le titulaire saisit son adresse e-mail ; la réponse est la même que le compte existe ou non
export default function MotDePasseOubliePage() {
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [envoye, setEnvoye] = useState(false);
  const [message, setMessage] = useState('');
  const [chargement, setChargement] = useState(false);

  const envoyer = async (e) => {
    e.preventDefault();
    setChargement(true);
    try {
      const reponse = await authApi.motDePasseOublie(email.trim());
      setMessage(reponse.detail);
      setEnvoye(true);
    } catch (err) {
      showServerErrors(err, { toast });
    } finally {
      setChargement(false);
    }
  };

  return (
    <div className="animate-fade-in-up">
      <h2 className="text-xl font-bold text-ink-800 mb-1">Mot de passe oublié</h2>
      <p className="text-sm text-ink-500 mb-6">Saisissez l'adresse e-mail de votre compte : nous vous envoyons un lien pour choisir un nouveau mot de passe.</p>

      {envoye ? (
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-lg border border-leaf-200 bg-leaf-50 p-4 text-sm text-leaf-800" role="status">
            <CheckCircle2 size={18} className="mt-0.5 shrink-0" />
            <p>{message}</p>
          </div>
          <Link to="/login" className="inline-flex items-center gap-1.5 text-sm font-medium text-forest-700 hover:underline">
            <ArrowLeft size={14} /> Retour à la connexion
          </Link>
        </div>
      ) : (
        <form onSubmit={envoyer} className="space-y-4">
          <div>
            <label htmlFor="email-oubli" className="label-base">Adresse e-mail</label>
            <div className="relative">
              <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
              <input
                id="email-oubli"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="nom@allakro.com"
                className="input-base pl-9"
              />
            </div>
          </div>
          <Button type="submit" className="w-full" size="lg" loading={chargement}>
            {!chargement && <Send size={16} />}
            Envoyer le lien
          </Button>
          <Link to="/login" className="inline-flex items-center gap-1.5 text-sm font-medium text-forest-700 hover:underline">
            <ArrowLeft size={14} /> Retour à la connexion
          </Link>
        </form>
      )}
    </div>
  );
}
