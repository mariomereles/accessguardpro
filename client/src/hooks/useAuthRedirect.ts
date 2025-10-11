import { useEffect } from 'react';
import { useLocation } from 'wouter';
import { useAuth } from '@/contexts/AuthContext';

export function useAuthRedirect() {
  const { isAuthenticated, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      // Redirect to login if not authenticated and trying to access protected routes
      const currentPath = window.location.pathname;
      if (currentPath.startsWith('/admin/') || currentPath.startsWith('/staff/')) {
        setLocation('/login');
      }
    }
  }, [isAuthenticated, isLoading, setLocation]);
}