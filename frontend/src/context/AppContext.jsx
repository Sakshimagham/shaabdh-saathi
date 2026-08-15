import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import axios from "axios";

const API = `${import.meta.env.VITE_BACKEND_URL || import.meta.env.REACT_APP_BACKEND_URL || 'http://localhost:5000'}/api`;
const AppCtx = createContext(null);
export const useApp = () => useContext(AppCtx);

export const api = axios.create({ baseURL: API });

const UI = {
  appName: "शब्दसाथी",
  tagline: { en: "Learn English, one friendly step at a time", mr: "इंग्रजी शिका, एक एक पाऊल मैत्रीने" },
  reading: { en: "Reading", mr: "वाचन" },
  writing: { en: "Writing", mr: "लेखन" },
  speaking: { en: "Speaking", mr: "बोलणे" },
  listening: { en: "Listening", mr: "ऐकणे" },
  interview: { en: "Interview Prep", mr: "मुलाखत तयारी" },
  vault: { en: "Dialogue Vault", mr: "संवाद खजिना" },
  bot: { en: "Talking Bot", mr: "बोलणारा मित्र" },
  dashboard: { en: "Dashboard", mr: "मुख्यपृष्ठ" },
  logout: { en: "Log out", mr: "बाहेर पडा" },
  back: { en: "Back", mr: "मागे" },
  submit: { en: "Submit", mr: "पाठवा" },
  next: { en: "Next", mr: "पुढे" },
  wentWell: { en: "What went well", mr: "काय छान झाले" },
  improve: { en: "What to improve", mr: "काय सुधारावे" },
  tip: { en: "Tip for next time", mr: "पुढच्या वेळेसाठी टिप" },
};

export function AppProvider({ children }) {
  const [user, setUser] = useState(null);
  const [lang, setLang] = useState(localStorage.getItem("su_lang") || "en");
  const [loading, setLoading] = useState(true);

  const setHeader = (uid) => { api.defaults.headers.common["X-User-Id"] = uid; };

  const refresh = useCallback(async () => {
    const uid = localStorage.getItem("su_uid");
    if (!uid) { setLoading(false); return; }
    setHeader(uid);
    try {
      const { data } = await api.get("/me");
      setUser(data);
    } catch { localStorage.removeItem("su_uid"); }
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const login = async (name, contact) => {
    const { data } = await api.post("/auth/login", { name, contact });
    localStorage.setItem("su_uid", data.id);
    setHeader(data.id);
    setUser(data);
    return data;
  };
  const logout = () => { localStorage.removeItem("su_uid"); setUser(null); };
  const toggleLang = () => setLang((l) => { const n = l === "en" ? "mr" : "en"; localStorage.setItem("su_lang", n); return n; });
  const t = (key) => UI[key] ? UI[key][lang] || UI[key].en : key;

  return (
    <AppCtx.Provider value={{ user, setUser, lang, toggleLang, login, logout, loading, t, refresh, UI }}>
      {children}
    </AppCtx.Provider>
  );
}