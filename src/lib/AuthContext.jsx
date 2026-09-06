import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, supabase } from '@/api/client';

const AuthContext = createContext();

/**
 * Anmeldestatus der App.
 *
 * Vorher kam der Zustand über die App-Einstellungen von Base44; jetzt ist die
 * Supabase-Session die Quelle. Der Ablauf bleibt aber derselbe, damit App.jsx
 * und ProtectedRoute unverändert weiterarbeiten:
 *
 *   nicht angemeldet          -> authError.type = 'auth_required'
 *   angemeldet, nicht frei    -> authError.type = 'user_not_registered'
 *   angemeldet und freigegeben-> user gesetzt, kein Fehler
 *
 * "Freigegeben" heißt: is_approved im Profil. Das ersetzt die
 * Registrierungsprüfung, die früher der Base44-Server übernommen hat, und
 * deckt sich mit den Row-Level-Security-Regeln der Datenbank.
 */
export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [authChecked, setAuthChecked] = useState(false);
  const [authError, setAuthError] = useState(null);

  const checkUserAuth = useCallback(async () => {
    setIsLoadingAuth(true);
    try {
      const { data } = await supabase.auth.getSession();
      if (!data?.session) {
        setUser(null);
        setIsAuthenticated(false);
        setAuthError({ type: 'auth_required', message: 'Anmeldung erforderlich' });
        return;
      }

      const currentUser = await api.auth.me();
      if (!currentUser.is_approved) {
        // Konto existiert, ist aber noch nicht freigeschaltet. Angemeldet
        // lassen, damit der Hinweis den richtigen Account nennen kann.
        setUser(currentUser);
        setIsAuthenticated(false);
        setAuthError({ type: 'user_not_registered', message: 'Konto noch nicht freigegeben' });
        return;
      }

      setUser(currentUser);
      setIsAuthenticated(true);
      setAuthError(null);
    } catch (error) {
      console.error('Anmeldeprüfung fehlgeschlagen:', error);
      setUser(null);
      setIsAuthenticated(false);
      setAuthError({ type: 'auth_required', message: error.message });
    } finally {
      setIsLoadingAuth(false);
      setAuthChecked(true);
    }
  }, []);

  useEffect(() => {
    checkUserAuth();

    // Auf Anmeldung, Abmeldung und Token-Erneuerung in anderen Tabs reagieren.
    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') {
        checkUserAuth();
      }
    });
    return () => listener?.subscription?.unsubscribe();
  }, [checkUserAuth]);

  const logout = useCallback(async (shouldRedirect = true) => {
    setUser(null);
    setIsAuthenticated(false);
    await api.auth.logout(shouldRedirect ? window.location.href : undefined);
  }, []);

  const navigateToLogin = useCallback(() => {
    api.auth.redirectToLogin(window.location.href);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated,
        isLoadingAuth,
        // Die Einstellungen kamen früher von Base44; ohne diesen Schritt ist
        // hier nichts mehr zu laden. Das Feld bleibt, damit App.jsx sich nicht
        // ändern muss.
        isLoadingPublicSettings: false,
        authChecked,
        authError,
        logout,
        navigateToLogin,
        checkUserAuth,
        checkAppState: checkUserAuth,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
