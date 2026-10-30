"use client";

import { createContext, useContext, useState } from "react";
import { USE_MOCKS } from "@/lib/api";

function getInitialWeek() {
  if (USE_MOCKS) return "2026-10-19";
  const today = new Date();
  const day = today.getUTCDay() || 7;
  today.setUTCDate(today.getUTCDate() - day + 1);
  return today.toISOString().slice(0, 10);
}

const AppContext = createContext<{
  week: string;
  setWeek: (value: string) => void;
  revision: number;
  refresh: () => void;
}>({
  week: "2026-10-19",
  setWeek: () => {},
  revision: 0,
  refresh: () => {},
});
export function AppContextProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [week, setWeek] = useState(getInitialWeek);
  const [revision, setRevision] = useState(0);
  return (
    <AppContext.Provider
      value={{
        week,
        setWeek,
        revision,
        refresh: () => setRevision((v) => v + 1),
      }}
    >
      {children}
    </AppContext.Provider>
  );
}
export const useAppContext = () => useContext(AppContext);
