import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { getMe, login as loginApi, updateMe } from '../api/auth';
import { getUserSettings } from '../api/core';
import { setShowHijriCalendar } from '../hooks/useShowHijriCalendar';
import {
  clearAuthSession,
  getAccessToken,
  hasAuthSession,
  isAccessTokenValid,
  persistAuthSession,
} from '../utils/authSession';

const syncThemeFromServer = async () => {
  try {
    const prefs = await getUserSettings();
    if (prefs?.theme === 'dark' || prefs?.theme === 'light') {
      localStorage.setItem('theme', prefs.theme);
      window.dispatchEvent(new CustomEvent('hallora-theme', { detail: prefs.theme }));
    }
    if (typeof prefs?.show_hijri_calendar === 'boolean') {
      setShowHijriCalendar(prefs.show_hijri_calendar);
    }
  } catch {
    /* settings optional */
  }
};

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(() => hasAuthSession());
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  const clearSession = useCallback(() => {
    clearAuthSession();
    setUser(null);
    setIsAuthenticated(false);
  }, []);

  const logout = useCallback(() => {
    const theme = localStorage.getItem('theme');
    clearAuthSession();
    if (theme) localStorage.setItem('theme', theme);
    setUser(null);
    setIsAuthenticated(false);
    window.location.href = '/login';
  }, []);

  useEffect(() => {
    let cancelled = false;

    const checkAuth = async () => {
      const token = getAccessToken();

      if (!token || !isAccessTokenValid(token)) {
        clearAuthSession();
        if (!cancelled) {
          setUser(null);
          setIsAuthenticated(false);
          setLoading(false);
        }
        return;
      }

      try {
        const userData = await getMe();
        if (cancelled) return;

        persistAuthSession({
          access: token,
          refresh: localStorage.getItem('refresh_token'),
          role: userData?.role,
          appType: userData?.app_type,
        });
        setUser(userData);
        setIsAuthenticated(true);
        await syncThemeFromServer();
      } catch {
        if (!cancelled) {
          clearSession();
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    checkAuth();

    return () => {
      cancelled = true;
    };
  }, [clearSession]);

  const login = async (credentials) => {
    const data = await loginApi(credentials);
    persistAuthSession({
      access: data.access,
      refresh: data.refresh,
    });
    const userData = await getMe();
    persistAuthSession({
      access: data.access,
      refresh: data.refresh,
      role: userData?.role,
      appType: userData?.app_type,
    });
    setUser(userData);
    setIsAuthenticated(true);
    await syncThemeFromServer();
    return userData;
  };

  const updateProfile = async (profileData) => {
    const updatedUser = await updateMe(profileData);
    setUser(updatedUser);
    return updatedUser;
  };

  const refreshUser = async () => {
    const userData = await getMe();
    persistAuthSession({
      access: getAccessToken(),
      refresh: localStorage.getItem('refresh_token'),
      role: userData?.role,
      appType: userData?.app_type,
    });
    setUser(userData);
    setIsAuthenticated(true);
    return userData;
  };

  return (
    <AuthContext.Provider value={{
      user,
      loading,
      isAuthenticated,
      login,
      updateProfile,
      refreshUser,
      logout,
      clearSession,
    }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
