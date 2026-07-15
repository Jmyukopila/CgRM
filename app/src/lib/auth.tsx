// Sesión persistente (token JWT + usuario) con AsyncStorage.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, setToken, type Area, type User } from './api';
import { registerPushToken } from './push';

const STORAGE_KEY = 'cgrm.session';

interface AuthState {
  user: User | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  // Autorregistro: siempre crea un empleado (el servidor lo fuerza igual, esto solo
  // evita mandar un rol que la API va a ignorar). Jefe/admin se dan de alta a mano.
  register: (data: { username: string; password: string; name: string; area: Area }) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) {
          const saved = JSON.parse(raw) as { token: string; user: User };
          setToken(saved.token);
          // Valida que el token siga vivo; si caducó, limpia la sesión.
          const me = await api.get<User>('/api/me');
          setUser(me);
          registerPushToken();
        }
      } catch {
        setToken(null);
        await AsyncStorage.removeItem(STORAGE_KEY);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const login = async (username: string, password: string) => {
    const res = await api.post<{ token: string; user: User }>('/api/auth/login', {
      username,
      password,
    });
    setToken(res.token);
    setUser(res.user);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(res));
    registerPushToken();
  };

  const register = async (data: { username: string; password: string; name: string; area: Area }) => {
    const res = await api.post<{ token: string; user: User }>('/api/auth/register', data);
    setToken(res.token);
    setUser(res.user);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(res));
    registerPushToken();
  };

  const logout = async () => {
    setToken(null);
    setUser(null);
    await AsyncStorage.removeItem(STORAGE_KEY);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return ctx;
}
