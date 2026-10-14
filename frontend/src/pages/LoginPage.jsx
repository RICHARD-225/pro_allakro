import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Mail, Lock, Eye, EyeOff, LogIn, AlertCircle } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import Button from '@/components/ui/Button';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const result = await login(email, password);
    setLoading(false);
    if (result.success) {
      navigate('/dashboard');
    } else {
      setError(result.error);
    }
  };

  // Comptes créés par `python manage.py seed_allakro` (affichés uniquement en développement)
  const fillDemo = (role) => {
    if (role === 'boss') {
      setEmail('admin@allakro.com');
      setPassword('Allakro@2025');
    } else {
      setEmail('k.jean@allakro.com');
      setPassword('Superviseur@2025');
    }
  };

  return (
    <div className="animate-fade-in-up">
      <h2 className="text-xl font-bold text-ink-800 mb-1">Connexion</h2>
      <p className="text-sm text-ink-500 mb-6">Accédez à votre espace de gestion</p>

      {error && (
        <div className="mb-4 flex items-center gap-2 p-3 rounded-lg bg-earth-50 border border-earth-200 text-earth-700 text-sm animate-fade-in">
          <AlertCircle size={16} className="shrink-0" />
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="email" className="label-base">Email</label>
          <div className="relative">
            <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="nom@allakro.com"
              required
              autoComplete="email"
              className="input-base pl-9"
            />
          </div>
        </div>

        <div>
          <label htmlFor="password" className="label-base">Mot de passe</label>
          <div className="relative">
            <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              autoComplete="current-password"
              className="input-base pl-9 pr-9"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-400 hover:text-ink-600 transition-colors"
              aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              className="w-4 h-4 rounded-sm border-ink-300 text-forest-600 focus:ring-forest-400"
            />
            <span className="text-sm text-ink-600">Se souvenir de moi</span>
          </label>
          {/* Sans serveur de courrier (VITE_MOT_DE_PASSE_OUBLIE=false à la construction), le Big Boss réinitialise les mots de passe */}
          {import.meta.env.VITE_MOT_DE_PASSE_OUBLIE === 'false' ? (
            <span className="text-xs text-ink-500">Mot de passe perdu ? Contactez votre administrateur.</span>
          ) : (
            <Link to="/mot-de-passe-oublie" className="text-xs text-forest-600 hover:text-forest-700 font-medium">
              Mot de passe oublié ?
            </Link>
          )}
        </div>

        <Button type="submit" className="w-full" size="lg" loading={loading}>
          {!loading && <LogIn size={16} />}
          Se connecter
        </Button>
      </form>

      {/* Demo accounts */}
      {import.meta.env.DEV && (
      <div className="mt-6 pt-5 border-t border-ink-100">
        <p className="text-xs text-ink-500 text-center mb-3">Comptes de démonstration (développement) :</p>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => fillDemo('boss')}
            className="px-3 py-2 text-xs font-medium rounded-lg border border-ink-200 hover:border-forest-300 hover:bg-forest-50/50 transition-colors text-ink-600"
          >
            Big Boss
          </button>
          <button
            onClick={() => fillDemo('superviseur')}
            className="px-3 py-2 text-xs font-medium rounded-lg border border-ink-200 hover:border-forest-300 hover:bg-forest-50/50 transition-colors text-ink-600"
          >
            Superviseur
          </button>
        </div>
      </div>
      )}
    </div>
  );
}
