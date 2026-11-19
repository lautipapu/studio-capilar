import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { authApi, clearToken, getToken, setToken, type User } from './api';

interface AuthContextValue {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (token: string, user: User) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  token: null,
  loading: true,
  login: async () => {},
  logout: () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setTokenState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const onUnauthorized = () => {
      setTokenState(null);
      setUser(null);
      setLoading(false);
    };
    window.addEventListener('studio:unauthorized', onUnauthorized);
    const stored = getToken();
    if (!stored) {
      setLoading(false);
      return () => window.removeEventListener('studio:unauthorized', onUnauthorized);
    }
    setTokenState(stored);
    authApi
      .me()
      .then(({ user }) => setUser(user))
      .catch(() => {
        clearToken();
        setTokenState(null);
      })
      .finally(() => setLoading(false));
    return () => window.removeEventListener('studio:unauthorized', onUnauthorized);
  }, []);

  const login = async (newToken: string, newUser: User) => {
    setToken(newToken);
    setTokenState(newToken);
    setUser(newUser);
    if (newUser.role === 'profesional') {
      try {
        const { user: currentUser } = await authApi.me();
        setUser(currentUser);
      } catch {
        // Keep the authenticated profile; protected requests will surface API errors.
      }
    }
  };

  const logout = () => {
    clearToken();
    setTokenState(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, login, logout }}>
      {loading ? null : children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
