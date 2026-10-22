import { createContext, useContext, useEffect, useState } from "react";
import api from "../lib/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null); // null = checking, false = logged out

  useEffect(() => {
    api
      .get("/auth/me")
      .then((r) => setUser(r.data))
      .catch(() => setUser(false));
  }, []);

  const logout = async () => {
    try {
      await api.post("/auth/logout");
    } catch {}
    setUser(false);
    window.location.href = "/login";
  };

  // Permissions come from the server (/auth/me) and only drive what the UI renders;
  // the API enforces every one of them independently.
  const can = (permission) => !!user && Array.isArray(user.permissions) && user.permissions.includes(permission);

  return (
    <AuthContext.Provider value={{ user, setUser, logout, can }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
