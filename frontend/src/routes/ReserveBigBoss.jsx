import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { ROLE } from '@/constants';

// Pages d'administration : un autre rôle est renvoyé au tableau de bord (l'API refuse de toute façon, ceci évite une page d'erreur)
export default function ReserveBigBoss({ children }) {
  const { user } = useAuth();
  return user?.role === ROLE.BIG_BOSS ? children : <Navigate to="/dashboard" replace />;
}
