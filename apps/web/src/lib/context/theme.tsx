'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { ConfigProvider, theme } from "antd";
import { tianjiTokens } from "@/lib/theme";

type ThemeMode = "light" | "dark";

interface ThemeCtxType { mode: ThemeMode; toggle: () => void; }
const Ctx = createContext<ThemeCtxType>({ mode: "light", toggle: () => {} });
export const useTheme = () => useContext(Ctx);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>("light");
  useEffect(() => {
    const s = localStorage.getItem("tianji-theme") as ThemeMode | null;
    if (s) setMode(s);
  }, []);
  const toggle = () => {
    const n = mode === "light" ? "dark" : "light";
    setMode(n);
    localStorage.setItem("tianji-theme", n);
  };
  return (
    <Ctx.Provider value={{ mode, toggle }}>
      <ConfigProvider theme={{ algorithm: mode === "dark" ? theme.darkAlgorithm : theme.defaultAlgorithm, token: tianjiTokens }}>
        {children}
      </ConfigProvider>
    </Ctx.Provider>
  );
}
