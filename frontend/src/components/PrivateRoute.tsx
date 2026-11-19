import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../auth';
import type { Role } from '../api';
import { LoadingSpinner } from './LoadingSpinner';
import type { ReactNode } from 'react';

interface Props {
  children: ReactNode;
  role?: Role | Role[];
}

export function PrivateRoute({ children, role }: Props) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <LoadingSpinner />;
  if (!user) return <Navigate to="/ingreso" state={{ from: location }} replace />;

  if (role) {
    const allowed = Array.isArray(role) ? role : [role];
    if (!allowed.includes(user.role)) {
      return (
        <div className="page flex-center" style={{ flexDirection: 'column', gap: '1rem' }}>
          <h2>Acceso restringido</h2>
          <p>No tenés permiso para ver esta página.</p>
        </div>
      );
    }
  }

  return <>{children}</>;
}
