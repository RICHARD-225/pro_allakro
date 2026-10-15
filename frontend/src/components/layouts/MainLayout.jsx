import { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';
import BottomNav from './BottomNav';
import ErrorBoundary from '@/components/ErrorBoundary';

export default function MainLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  return (
    <div className="flex h-screen overflow-hidden bg-cream-100">
      <Sidebar
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed((v) => !v)}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
      />
      <div className="flex-1 flex flex-col min-w-0">
        <Header onOpenMobileMenu={() => setMobileOpen(true)} />
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-[1600px] mx-auto px-4 lg:px-6 pt-4 sm:pt-6 pb-24 lg:pb-6">
            <ErrorBoundary resetKey={location.pathname}>
              {/* La clé relance l'animation d'entrée à chaque changement de page (pas à chaque changement d'onglet) */}
              <div key={location.pathname} className="page-entree">
                <Outlet />
              </div>
            </ErrorBoundary>
          </div>
        </main>
        <BottomNav onOpenMenu={() => setMobileOpen(true)} />
      </div>
    </div>
  );
}
