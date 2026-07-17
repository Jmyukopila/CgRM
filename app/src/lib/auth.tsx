// Sesión persistente (token JWT + usuario) con AsyncStorage.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { ApiError, api, setToken, type Area, type User } from './api';
import { clearCache } from './cache';
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
      let saved: { token: string; user: User } | null = null;
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) saved = JSON.parse(raw) as { token: string; user: User };
      } catch {
        saved = null;
      }
      if (!saved) {
        setLoading(false);
        return;
      }
      setToken(saved.token);
      try {
        // Valida que el token siga vivo; si caducó de verdad (401/403), limpia la sesión.
        const me = await api.get<User>('/api/me');
        setUser(me);
        registerPushToken();
      } catch (err) {
        if (err instanceof ApiError && err.status === 0) {
          // Sin señal al arrancar: no se puede confirmar el token, pero tampoco hay
          // motivo para forzar logout por un simple corte de red. Se conserva la
          // sesión guardada; el usuario ve las pantallas con caché y lo que necesite
          // red fallará con su propio aviso cuando se use.
          setUser(saved.user);
        } else {
          setToken(null);
          await AsyncStorage.removeItem(STORAGE_KEY);
        }
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
    await clearCache();
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
