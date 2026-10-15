import { lazy, Suspense, useEffect, useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from '@/contexts/AuthContext';
import { ToastProvider } from '@/contexts/ToastContext';
import { FilterProvider } from '@/contexts/FilterContext';
import { ThemeProvider } from '@/contexts/ThemeContext';
import ProtectedRoute from './ProtectedRoute';
import ChargementGlobal from '@/components/ChargementGlobal';
import { demarrerChargement } from '@/utils/chargement';
import ReserveBigBoss from './ReserveBigBoss';
import MainLayout from '@/components/layouts/MainLayout';
import AuthLayout from '@/components/layouts/AuthLayout';
import { SkeletonCard } from '@/components/ui/Skeleton';

const LoginPage = lazy(() => import('@/pages/LoginPage'));
const MotDePasseOubliePage = lazy(() => import('@/pages/MotDePasseOubliePage'));
const ReinitialiserMotDePassePage = lazy(() => import('@/pages/ReinitialiserMotDePassePage'));
const DashboardPage = lazy(() => import('@/pages/DashboardPage'));
const ExploitationPage = lazy(() => import('@/pages/ExploitationPage'));
const PlantationDetailPage = lazy(() => import('@/pages/PlantationDetailPage'));
const CampementDetailPage = lazy(() => import('@/pages/CampementDetailPage'));
const BlocDetailPage = lazy(() => import('@/pages/BlocDetailPage'));
const PersonnesPage = lazy(() => import('@/pages/PersonnesPage'));
const TravauxPage = lazy(() => import('@/pages/TravauxPage'));
const DepensesPage = lazy(() => import('@/pages/DepensesPage'));
const SalairesPage = lazy(() => import('@/pages/SalairesPage'));
const StockPage = lazy(() => import('@/pages/StockPage'));
const ParticuliersPage = lazy(() => import('@/pages/ParticuliersPage'));
const BilanPage = lazy(() => import('@/pages/BilanPage'));
const RapportsPage = lazy(() => import('@/pages/RapportsPage'));
const UtilisateursPage = lazy(() => import('@/pages/UtilisateursPage'));
const JournalPage = lazy(() => import('@/pages/JournalPage'));
const ParametresPage = lazy(() => import('@/pages/ParametresPage'));
const TypesTravauxPage = lazy(() => import('@/pages/TypesTravauxPage'));
const CategoriesDepensesPage = lazy(() => import('@/pages/CategoriesDepensesPage'));

function PageFallback() {
  // Le chargement d'une page (code téléchargé à la demande) fait avancer la barre de progression du haut de l'écran
  useEffect(() => demarrerChargement(), []);
  return (
    <div className="space-y-4 page-entree">
      <SkeletonCard />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
    </div>
  );
}

export default function AppRoutes() {
  return (
    <ThemeProvider>
      <FirstLaunchScreen>
        <AuthProvider>
          <ToastProvider>
            <FilterProvider>
              <ChargementGlobal />
              <Routes>
            {/* Auth */}
            <Route element={<AuthLayout />}>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/mot-de-passe-oublie" element={<Suspense fallback={<PageFallback />}><MotDePasseOubliePage /></Suspense>} />
              <Route path="/reinitialiser-mot-de-passe" element={<Suspense fallback={<PageFallback />}><ReinitialiserMotDePassePage /></Suspense>} />
            </Route>

            {/* App */}
            <Route
              element={
                <ProtectedRoute>
                  <MainLayout />
                </ProtectedRoute>
              }
            >
              <Route path="/dashboard" element={<Suspense fallback={<PageFallback />}><DashboardPage /></Suspense>} />
              {/* Toute la structure de l'exploitation dans une seule page (onglets) ; les anciennes adresses y renvoient */}
              <Route path="/exploitation" element={<Suspense fallback={<PageFallback />}><ExploitationPage /></Suspense>} />
              <Route path="/plantations" element={<Navigate to="/exploitation?onglet=plantations" replace />} />
              <Route path="/campements" element={<Navigate to="/exploitation?onglet=campements" replace />} />
              <Route path="/blocs" element={<Navigate to="/exploitation?onglet=blocs" replace />} />
              <Route path="/plantations/:id" element={<Suspense fallback={<PageFallback />}><PlantationDetailPage /></Suspense>} />
              <Route path="/campements/:id" element={<Suspense fallback={<PageFallback />}><CampementDetailPage /></Suspense>} />
              <Route path="/blocs/:id" element={<Suspense fallback={<PageFallback />}><BlocDetailPage /></Suspense>} />
              <Route path="/personnes" element={<Suspense fallback={<PageFallback />}><PersonnesPage /></Suspense>} />
              {/* Les équipes se créent avec les travaux */}
              <Route path="/equipes" element={<Navigate to="/travaux" replace />} />
              <Route path="/travaux" element={<Suspense fallback={<PageFallback />}><TravauxPage /></Suspense>} />
              <Route path="/depenses" element={<Suspense fallback={<PageFallback />}><DepensesPage /></Suspense>} />
              <Route path="/salaires" element={<Suspense fallback={<PageFallback />}><SalairesPage /></Suspense>} />
              {/* Anciennes sections, regroupées dans Salaires */}
              <Route path="/remunerations" element={<Navigate to="/salaires" replace />} />
              <Route path="/paiements" element={<Navigate to="/salaires?onglet=paiements" replace />} />
              <Route path="/stock" element={<Suspense fallback={<PageFallback />}><StockPage /></Suspense>} />
              <Route path="/particuliers" element={<Suspense fallback={<PageFallback />}><ParticuliersPage /></Suspense>} />
              <Route path="/bilan" element={<Suspense fallback={<PageFallback />}><BilanPage /></Suspense>} />
              <Route path="/rapports" element={<Suspense fallback={<PageFallback />}><RapportsPage /></Suspense>} />
              <Route path="/utilisateurs" element={<ReserveBigBoss><Suspense fallback={<PageFallback />}><UtilisateursPage /></Suspense></ReserveBigBoss>} />
              <Route path="/journal" element={<ReserveBigBoss><Suspense fallback={<PageFallback />}><JournalPage /></Suspense></ReserveBigBoss>} />
              <Route path="/parametres" element={<Suspense fallback={<PageFallback />}><ParametresPage /></Suspense>} />
              <Route path="/types-travaux" element={<Suspense fallback={<PageFallback />}><TypesTravauxPage /></Suspense>} />
              <Route path="/categories" element={<Suspense fallback={<PageFallback />}><CategoriesDepensesPage /></Suspense>} />
            </Route>

            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
              </Routes>
            </FilterProvider>
          </ToastProvider>
        </AuthProvider>
      </FirstLaunchScreen>
    </ThemeProvider>
  );
}

function FirstLaunchScreen({ children }) {
  const [showSplash, setShowSplash] = useState(() => {
    try {
      return localStorage.getItem('allakro_startup_seen') !== 'true';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    if (!showSplash) return undefined;

    // Show the brand mark once on first launch, then let the app render normally.
    try {
      localStorage.setItem('allakro_startup_seen', 'true');
    } catch {
      // The splash still works for this visit when storage is unavailable.
    }

    const timer = window.setTimeout(() => setShowSplash(false), 1000);
    return () => window.clearTimeout(timer);
  }, [showSplash]);

  return (
    <>
      {children}
      {showSplash && (
        <div
          className="fixed inset-0 z-200 flex flex-col items-center justify-center gap-4 bg-forest-800 text-white"
          role="status"
          aria-live="polite"
        >
          <img src="/icon-192.png" alt="" className="h-20 w-20 animate-fade-in rounded-2xl shadow-lg" />
          <span className="text-lg font-semibold">ALLAKRO</span>
          <span className="sr-only">Chargement de l’application</span>
        </div>
      )}
    </>
  );
}
