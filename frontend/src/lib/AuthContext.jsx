import React, { createContext, useContext, useState } from 'react';

const AuthContext = createContext();

export function AuthProvider({ children }) {
  // Bypassing authentication for local development as requested
  const [isAuthenticated] = useState(true);

  const login = () => {};
  const logout = () => {};

  const authenticatedFetch = async (url, options = {}) => {
    const headers = {
      ...options.headers,
      'Content-Type': 'application/json',
    };
    // No x-api-key needed anymore
    return fetch(url, { ...options, headers });
  };

  return (
    <AuthContext.Provider value={{ isAuthenticated, login, logout, authenticatedFetch }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
