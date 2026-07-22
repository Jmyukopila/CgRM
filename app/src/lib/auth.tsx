// Sesión persistente (token JWT + usuario) con AsyncStorage.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { ApiError, api, setToken, type Area, type User } from './api';
import { clearCache } from './cache';
import { registerPushToken } from './push';

const STORAGE_KEY = 'cgrm.session';

// Cada cuánto se manda el "sigo vivo" mientras el turno está abierto y la app en
// primer plano. Si el servidor deja de recibirlos, cierra el turno solo (ver el
// barrido de sweepIdleShifts en server/src/index.js) usando la hora del último ping.
const HEARTBEAT_MS = 2 * 60 * 1000;

interface AuthState {
  user: User | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  // Autorregistro: siempre crea un empleado (el servidor lo fuerza igual, esto solo
  // evita mandar un rol que la API va a ignorar). Jefe/admin se dan de alta a mano.
  register: (data: { username: string; password: string; name: string; area: Area }) => Promise<void>;
  logout: () => Promise<void>;
  // Turno del empleado: vive aquí (no en la pantalla de perfil) para que el heartbeat
  // siga corriendo aunque el usuario navegue a otra pestaña.
  clockedIn: boolean;
  setClockedIn: (v: boolean) => void;
  pingShift: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [clockedIn, setClockedIn] = useState(false);

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

  // Al tener sesión de empleado, se consulta si ya venía con turno abierto (p. ej.
  // reabrir la app sin haber cerrado turno) para retomar el heartbeat donde quedó.
  useEffect(() => {
    if (!user || user.role !== 'empleado') {
      setClockedIn(false);
      return;
    }
    api.get<{ lastKind: string | null }>('/api/shift/today')
      .then((r) => setClockedIn(r.lastKind === 'entrada'))
      .catch(() => {});
  }, [user]);

  const pingShift = useCallback(() => {
    if (clockedIn) api.post('/api/shift/heartbeat', {}).catch(() => {});
  }, [clockedIn]);

  useEffect(() => {
    if (!clockedIn) return;
    const id = setInterval(() => {
      api.post('/api/shift/heartbeat', {}).catch((err) => {
        // El servidor ya cerró el turno (barrido por inactividad, u otro dispositivo
        // lo cerró): se refleja aquí sin tratarlo como un error de red cualquiera.
        if (err instanceof ApiError && err.status === 409) setClockedIn(false);
      });
    }, HEARTBEAT_MS);
    return () => clearInterval(id);
  }, [clockedIn]);

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
    setClockedIn(false);
    await AsyncStorage.removeItem(STORAGE_KEY);
    await clearCache();
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, clockedIn, setClockedIn, pingShift }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return ctx;
}
