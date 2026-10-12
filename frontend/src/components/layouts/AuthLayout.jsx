import { useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Download, Sprout } from 'lucide-react';
import { APP_NAME, APP_TAGLINE } from '@/constants';

export default function AuthLayout() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showInstallButton, setShowInstallButton] = useState(true);

  useEffect(() => {
    const handleBeforeInstallPrompt = (event) => {
      event.preventDefault();
      setDeferredPrompt(event);
      setShowInstallButton(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) {
      window.alert('Utilisez le menu du navigateur et choisissez “Ajouter à l’écran d’accueil” pour installer l’application.');
      return;
    }

    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    setShowInstallButton(false);
  };

  return (
    <main className="min-h-screen flex flex-col lg:flex-row">
      {/* Left panel — branding */}
      <div className="w-full lg:w-1/2 relative overflow-hidden min-h-[260px] lg:min-h-screen">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{
            backgroundImage: "url('/plantation.jpg')",
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-r from-forest-950/85 via-forest-900/65 to-forest-800/30" />
        <div className="absolute inset-0 opacity-10" style={{
          backgroundImage: 'radial-gradient(circle at 20% 80%, rgba(81, 151, 68, 0.4) 0%, transparent 50%), radial-gradient(circle at 80% 20%, rgba(151, 144, 47, 0.3) 0%, transparent 50%)',
        }} />
        <div className="relative z-10 flex flex-col justify-between p-6 sm:p-8 lg:p-12 text-white w-full h-full">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-white/10 backdrop-blur-sm border border-white/20 flex items-center justify-center shadow-lg">
              <Sprout size={24} className="text-white" />
            </div>
            <div>
              <p className="text-lg font-bold">{APP_NAME}</p>
              <p className="text-xs text-forest-100">{APP_TAGLINE}</p>
            </div>
          </div>
          <div className="max-w-md rounded-2xl bg-black/15 backdrop-blur-sm border border-white/10 p-5 shadow-xl">
            <h1 className="text-3xl font-bold leading-tight mb-3">
              Gérez vos plantations<br />avec précision
            </h1>
            <p className="text-forest-100 text-sm leading-relaxed">
              Suivez les travaux, les dépenses, les stocks et les rémunérations
              de votre exploitation agricole en temps réel.
            </p>
          </div>

          {showInstallButton && (
            <button
              type="button"
              onClick={handleInstall}
              className="inline-flex w-fit items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 py-2 text-sm font-medium text-white backdrop-blur-sm transition hover:bg-white/15"
            >
              <Download size={16} />
              Télécharger l'app
            </button>
          )}

          <p className="text-xs text-forest-100">© 2025 {APP_NAME}. Tous droits réservés.</p>
        </div>
      </div>

      {/* Right panel — form */}
      <div className="flex-1 flex items-center justify-center p-6 bg-cream-50">
        <div className="w-full max-w-sm">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center justify-center gap-3 mb-8">
            <div className="w-10 h-10 rounded-lg bg-forest-600 flex items-center justify-center">
              <Sprout size={20} className="text-white" />
            </div>
            <div>
              <p className="text-base font-bold text-forest-800">{APP_NAME}</p>
              <p className="text-xs text-ink-500">{APP_TAGLINE}</p>
            </div>
          </div>
          <Outlet />
        </div>
      </div>
    </main>
  );
}
