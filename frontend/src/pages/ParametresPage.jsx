import { useState } from 'react';
import { Settings, User, Shield, Sun, Moon } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import { Card, Button, Input, Badge } from '@/components/ui';
import { useToast } from '@/contexts/ToastContext';
import { useAuth } from '@/contexts/AuthContext';
import { authApi } from '@/api/auth';
import { ROLE_LABELS, APP_NAME } from '@/constants';
import { useTheme } from '@/contexts/ThemeContext';
import { formatDateTime } from '@/utils/format';
import { showServerErrors } from '@/utils/errors';

const SECTIONS = [
  { key: 'profile', label: 'Profil', icon: User },
  { key: 'security', label: 'Sécurité', icon: Shield },
  { key: 'application', label: 'Application', icon: Settings },
];

const EMPTY_MDP = { ancien_mot_de_passe: '', nouveau_mot_de_passe: '', confirmation: '' };

export default function ParametresPage() {
  const { user } = useAuth();
  const { theme, setTheme } = useTheme();
  const toast = useToast();
  const [mdp, setMdp] = useState(EMPTY_MDP);
  const [mdpErrors, setMdpErrors] = useState({});
  const [saving, setSaving] = useState(false);

  const changerMotDePasse = async () => {
    const errs = {};
    if (!mdp.ancien_mot_de_passe) errs.ancien_mot_de_passe = 'Obligatoire';
    if (mdp.nouveau_mot_de_passe.length < 8) errs.nouveau_mot_de_passe = '8 caractères minimum';
    if (mdp.confirmation !== mdp.nouveau_mot_de_passe) errs.confirmation = 'La confirmation ne correspond pas';
    setMdpErrors(errs);
    if (Object.keys(errs).length) return;
    setSaving(true);
    try {
      await authApi.changerMotDePasse(mdp);
      setMdp(EMPTY_MDP);
      toast.success('Mot de passe modifié');
    } catch (err) {
      showServerErrors(err, { setFormErrors: setMdpErrors, toast });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4 sm:space-y-5">
      <PageHeader title="Paramètres" subtitle="Votre compte et l'application" icon={Settings} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Sidebar nav */}
        <nav aria-label="Sections des paramètres" className="card h-fit p-3">
          {SECTIONS.map((s) => {
            const Icon = s.icon;
            return (
              <a
                key={s.key}
                href={`#${s.key}`}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-ink-600 transition-colors hover:bg-cream-50"
              >
                <Icon size={18} className="text-forest-600" />
                {s.label}
              </a>
            );
          })}
        </nav>

        {/* Content */}
        <div className="lg:col-span-2 space-y-4">
          <Card id="profile" className="scroll-mt-6 p-5">
            <h2 className="text-sm font-semibold text-ink-800 mb-4">Profil utilisateur</h2>
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-forest-100 flex items-center justify-center">
                  <User size={24} className="text-forest-700" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-ink-800">{user?.name}</p>
                  <p className="text-xs text-ink-500">{user?.email}</p>
                  <Badge className="mt-1 bg-forest-50 text-forest-700">{ROLE_LABELS[user?.role] || user?.role_libelle}</Badge>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Input label="Nom complet" value={user?.name || ''} disabled hint="Modifiable dans la fiche du personnel" />
                <Input label="Email (identifiant)" value={user?.email || ''} disabled hint="Modifiable par le Big Boss (Utilisateurs)" />
              </div>
              <p className="text-xs tabular-nums text-ink-500">Dernière connexion : {formatDateTime(user?.derniere_connexion)}</p>
            </div>
          </Card>

          <Card id="security" className="scroll-mt-6 p-5">
            <h2 className="text-sm font-semibold text-ink-800 mb-4">Changer de mot de passe</h2>
            <div className="space-y-4">
              <Input
                label="Mot de passe actuel"
                type="password"
                autoComplete="current-password"
                value={mdp.ancien_mot_de_passe}
                onChange={(e) => setMdp({ ...mdp, ancien_mot_de_passe: e.target.value })}
                error={mdpErrors.ancien_mot_de_passe}
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Input
                  label="Nouveau mot de passe"
                  type="password"
                  autoComplete="new-password"
                  value={mdp.nouveau_mot_de_passe}
                  onChange={(e) => setMdp({ ...mdp, nouveau_mot_de_passe: e.target.value })}
                  error={mdpErrors.nouveau_mot_de_passe}
                  hint="8 caractères minimum, pas uniquement des chiffres"
                />
                <Input
                  label="Confirmer"
                  type="password"
                  autoComplete="new-password"
                  value={mdp.confirmation}
                  onChange={(e) => setMdp({ ...mdp, confirmation: e.target.value })}
                  error={mdpErrors.confirmation}
                />
              </div>
              <Button variant="outline" size="sm" onClick={changerMotDePasse} loading={saving}>Modifier le mot de passe</Button>
            </div>
          </Card>

          <Card id="application" className="scroll-mt-6 p-5">
            <h2 className="text-sm font-semibold text-ink-800 mb-4">Application</h2>
            <div className="space-y-3">
              <div className="flex flex-col gap-3 border-b border-ink-100 py-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-medium text-ink-700">Apparence</p>
                  <p className="text-xs text-ink-500">Choisissez le thème de l’application</p>
                </div>
                <div className="inline-flex w-fit rounded-lg border border-ink-200 bg-cream-50 p-1" role="radiogroup" aria-label="Thème de l’application">
                  <button
                    type="button"
                    role="radio"
                    aria-checked={theme === 'light'}
                    onClick={() => setTheme('light')}
                    className={`inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${theme === 'light' ? 'bg-white text-forest-700 shadow-sm' : 'text-ink-500 hover:text-ink-700'}`}
                  >
                    <Sun size={16} />
                    Clair
                  </button>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={theme === 'dark'}
                    onClick={() => setTheme('dark')}
                    className={`inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${theme === 'dark' ? 'bg-forest-800 text-white shadow-sm' : 'text-ink-500 hover:text-ink-700'}`}
                  >
                    <Moon size={16} />
                    Sombre
                  </button>
                </div>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-ink-100">
                <div>
                  <p className="text-sm font-medium text-ink-700">Nom de l'application</p>
                  <p className="text-xs text-ink-500">{APP_NAME}</p>
                </div>
                <Badge status="active">Configuré</Badge>
              </div>
              <div className="flex items-center justify-between py-2">
                <div>
                  <p className="text-sm font-medium text-ink-700">API Django</p>
                  <p className="text-xs text-ink-500">{import.meta.env.VITE_API_URL || '/api/v1'}</p>
                </div>
                <Badge status="active">Connectée</Badge>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
