import { createContext, useContext, useState, useEffect } from 'react';
import { getToken, getUser, setAuth, clearAuth, login as apiLogin } from '../api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(getUser());
  const [token, setToken] = useState(getToken());
  const [loading, setLoading] = useState(false);

  const isAuthenticated = !!token && !!user;

  const loginUser = async (usuario, password) => {
    setLoading(true);
    try {
      const data = await apiLogin(usuario, password);
      setAuth(data.token, data.user);
      setUser(data.user);
      setToken(data.token);
      return data;
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    clearAuth();
    setUser(null);
    setToken(null);
  };

  return (
    <AuthContext.Provider value={{ user, token, isAuthenticated, loading, loginUser, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be inside AuthProvider');
  return ctx;
}
