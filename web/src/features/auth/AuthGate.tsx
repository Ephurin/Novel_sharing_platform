import { useQuery } from '@tanstack/react-query';
import type { PropsWithChildren } from 'react';
import { useEffect } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { getCurrentUser } from './auth-api';
import type { UserRole } from './auth-types';
import { useAuthStore } from './useAuthStore';
import { LoadingState, PermissionState } from '../../shared/components/PageStates';

// Restores the signed-in user from a stored access token; a rejected token clears the session.
function useSessionRestore() {
  const accessToken = useAuthStore((state) => state.accessToken);
  const user = useAuthStore((state) => state.user);
  const sessionStatus = useAuthStore((state) => state.sessionStatus);
  const beginRestore = useAuthStore((state) => state.beginRestore);
  const setUser = useAuthStore((state) => state.setUser);
  const clearSession = useAuthStore((state) => state.clearSession);

  const currentUserQuery = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: getCurrentUser,
    enabled: Boolean(accessToken && !user),
    retry: false
  });

  useEffect(() => {
    if (accessToken && !user && sessionStatus === 'unknown') {
      beginRestore();
    }
  }, [accessToken, beginRestore, sessionStatus, user]);

  useEffect(() => {
    if (currentUserQuery.data) {
      setUser(currentUserQuery.data);
    }
  }, [currentUserQuery.data, setUser]);

  useEffect(() => {
    if (currentUserQuery.isError) {
      clearSession();
    }
  }, [clearSession, currentUserQuery.isError]);

  return { accessToken, user, clearSession };
}

export function AuthGate({ children }: PropsWithChildren) {
  const { accessToken, user, clearSession } = useSessionRestore();

  if (!accessToken) {
    return <Navigate to="/login" replace />;
  }

  if (!user) {
    return <LoadingState label="Restoring session..." />;
  }

  if (user.status === 'LOCKED') {
    return <PermissionState requiredRole="Unlocked account" onBack={clearSession} />;
  }

  return children;
}

// Public pages: guests see them without logging in, while a stored session is still restored so
// signed-in users keep their navigation and per-user state. Mutations stay protected by the API.
export function OptionalSession({ children }: PropsWithChildren) {
  const { accessToken, user } = useSessionRestore();

  if (accessToken && !user) {
    return <LoadingState label="Restoring session..." />;
  }

  return children;
}

export function RoleGuard({ roles, children }: PropsWithChildren<{ roles: UserRole[] }>) {
  const user = useAuthStore((state) => state.user);
  const navigate = useNavigate();

  if (!user) {
    return <AuthGate>{children}</AuthGate>;
  }

  if (!roles.includes(user.role)) {
    return <PermissionState requiredRole={roles.join(' or ')} onBack={() => navigate(getRoleHomePath(user.role), { replace: true })} />;
  }

  return children;
}

export function RoleHomeRedirect() {
  const user = useAuthStore((state) => state.user);

  return <Navigate to={getRoleHomePath(user?.role)} replace />;
}

function getRoleHomePath(role?: UserRole) {
  if (role === 'ADMIN') return '/admin';
  if (role === 'AUTHOR') return '/author';
  return '/reader';
}
