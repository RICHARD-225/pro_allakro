import { lazy, Suspense, useEffect, useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from '@/contexts/AuthContext';
import { ToastProvider } from '@/contexts/ToastContext';
import { FilterProvider } from '@/contexts/FilterContext';
import { ThemeProvider } from '@/contexts/ThemeContext';
import ProtectedRoute from './ProtectedRoute';
import MainLayout from '@/components/layouts/MainLayout';
import AuthLayout from '@/components/layouts/AuthLayout';
import { SkeletonCard } from '@/components/ui/Skeleton';

const LoginPage = lazy(() => import('@/pages/LoginPage'));
const DashboardPage = lazy(() => import('@/pages/DashboardPage'));
const PlantationsPage = lazy(() => import('@/pages/PlantationsPage'));
const CampementsPage = lazy(() => import('@/pages/CampementsPage'));
const BlocsPage = lazy(() => import('@/pages/BlocsPage'));
const BlocDetailPage = lazy(() => import('@/pages/BlocDetailPage'));
const PersonnesPage = lazy(() => import('@/pages/PersonnesPage'));
const EquipesPage = lazy(() => import('@/pages/EquipesPage'));
const TravauxPage = lazy(() => import('@/pages/TravauxPage'));
const DepensesPage = lazy(() => import('@/pages/DepensesPage'));
const RemunerationsPage = lazy(() => import('@/pages/RemunerationsPage'));
const PaiementsPage = lazy(() => import('@/pages/PaiementsPage'));
const StockPage = lazy(() => import('@/pages/StockPage'));
const ParticuliersPage = lazy(() => import('@/pages/ParticuliersPage'));
const PrevisionsPage = lazy(() => import('@/pages/PrevisionsPage'));
const BilanPage = lazy(() => import('@/pages/BilanPage'));
const RapportsPage = lazy(() => import('@/pages/RapportsPage'));
const UtilisateursPage = lazy(() => import('@/pages/UtilisateursPage'));
const JournalPage = lazy(() => import('@/pages/JournalPage'));
const ParametresPage = lazy(() => import('@/pages/ParametresPage'));
const TypesTravauxPage = lazy(() => import('@/pages/TypesTravauxPage'));
const CategoriesDepensesPage = lazy(() => import('@/pages/CategoriesDepensesPage'));

function PageFallback() {
  return (
    <div className="space-y-4">
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
              <Routes>
            {/* Auth */}
            <Route element={<AuthLayout />}>
              <Route path="/login" element={<LoginPage />} />
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
              <Route path="/plantations" element={<Suspense fallback={<PageFallback />}><PlantationsPage /></Suspense>} />
              <Route path="/campements" element={<Suspense fallback={<PageFallback />}><CampementsPage /></Suspense>} />
              <Route path="/blocs" element={<Suspense fallback={<PageFallback />}><BlocsPage /></Suspense>} />
              <Route path="/blocs/:id" element={<Suspense fallback={<PageFallback />}><BlocDetailPage /></Suspense>} />
              <Route path="/personnes" element={<Suspense fallback={<PageFallback />}><PersonnesPage /></Suspense>} />
              <Route path="/equipes" element={<Suspense fallback={<PageFallback />}><EquipesPage /></Suspense>} />
              <Route path="/travaux" element={<Suspense fallback={<PageFallback />}><TravauxPage /></Suspense>} />
              <Route path="/depenses" element={<Suspense fallback={<PageFallback />}><DepensesPage /></Suspense>} />
              <Route path="/remunerations" element={<Suspense fallback={<PageFallback />}><RemunerationsPage /></Suspense>} />
              <Route path="/paiements" element={<Suspense fallback={<PageFallback />}><PaiementsPage /></Suspense>} />
              <Route path="/stock" element={<Suspense fallback={<PageFallback />}><StockPage /></Suspense>} />
              <Route path="/particuliers" element={<Suspense fallback={<PageFallback />}><ParticuliersPage /></Suspense>} />
              <Route path="/previsions" element={<Suspense fallback={<PageFallback />}><PrevisionsPage /></Suspense>} />
              <Route path="/bilan" element={<Suspense fallback={<PageFallback />}><BilanPage /></Suspense>} />
              <Route path="/rapports" element={<Suspense fallback={<PageFallback />}><RapportsPage /></Suspense>} />
              <Route path="/utilisateurs" element={<Suspense fallback={<PageFallback />}><UtilisateursPage /></Suspense>} />
              <Route path="/journal" element={<Suspense fallback={<PageFallback />}><JournalPage /></Suspense>} />
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
          className="fixed inset-0 z-[200] flex flex-col items-center justify-center gap-4 bg-forest-800 text-white"
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
