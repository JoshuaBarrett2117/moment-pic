import { useState, useCallback } from 'react';
import { clearAuthSession, markAuthSession } from '../app/auth-session';
import { api } from '../lib/api';
import type { LoginResponseDTO } from '../types/api';

interface UseAuthReturn {
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
}

export function useAuth(): UseAuthReturn {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const login = useCallback(async (username: string, password: string): Promise<boolean> => {
    setIsLoading(true);
    setError(null);
    try {
      await api.post<LoginResponseDTO>('/auth/login', { username, password });
      markAuthSession();
      setIsAuthenticated(true);
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : '登录失败';
      setError(message);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const logout = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    try {
      await api.post('/auth/logout');
    } finally {
      clearAuthSession();
      setIsAuthenticated(false);
      setIsLoading(false);
    }
  }, []);

  return { login, logout, isAuthenticated, isLoading, error };
}
