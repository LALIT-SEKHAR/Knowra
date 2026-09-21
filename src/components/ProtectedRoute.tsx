import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { AppBootSkeleton } from './Skeleton';

export function ProtectedRoute() {
  const { user, loading } = useAuth();

  if (loading) {
    return <AppBootSkeleton />;
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  return <Outlet />;
}
