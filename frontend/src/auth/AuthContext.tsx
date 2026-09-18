import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';

export type UserRole = 
  | 'AUTHORITY'
  | 'SUPERVISOR'
  | 'WARD_OFFICER'
  | 'DRIVER'
  | 'WORKER'
  | 'CITIZEN'
  | 'ADMIN';

export interface UserSession {
  token: string;
  userId: string;
  username: string;
  role: UserRole;
  fullName: string;
  workerId?: string | null;
  householdId?: string | null;
}

export interface AuthContextValue {
  session: UserSession | null;
  isAuthenticated: boolean;
  role: UserRole | null;
  login: (token: string, user: { id: string; username: string; role: UserRole; fullName: string; workerId?: string | null; householdId?: string | null }) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const AUTH_STORAGE_KEY = 'municipal_session';

export function parseJwtPayload(token: string): any | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const base64Url = parts[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonPayload);
  } catch {
    return null;
  }
}

export function loadStoredSession(): UserSession | null {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;
    const session: UserSession = JSON.parse(raw);
    if (!session.token || !session.userId || !session.role) {
      localStorage.removeItem(AUTH_STORAGE_KEY);
      return null;
    }
    const payload = parseJwtPayload(session.token);
    if (payload && payload.exp && payload.exp * 1000 < Date.now()) {
      localStorage.removeItem(AUTH_STORAGE_KEY);
      return null;
    }
    return session;
  } catch {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    return null;
  }
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<UserSession | null>(() => loadStoredSession());

  const login = useCallback(
    (
      token: string,
      user: {
        id: string;
        username: string;
        role: UserRole;
        fullName: string;
        workerId?: string | null;
        householdId?: string | null;
      }
    ) => {
      const newSession: UserSession = {
        token,
        userId: user.id || (user as any).userId,
        username: user.username,
        role: user.role,
        fullName: user.fullName || (user as any).full_name || user.username,
        workerId: user.workerId,
        householdId: user.householdId,
      };
      setSession(newSession);
      try {
        localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(newSession));
      } catch {
        // storage disabled or quota exceeded
      }
    },
    []
  );

  const logout = useCallback(() => {
    setSession(null);
    try {
      localStorage.removeItem(AUTH_STORAGE_KEY);
    } catch {
      // storage disabled
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      isAuthenticated: session !== null,
      role: session?.role ?? null,
      login,
      logout,
    }),
    [session, login, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
