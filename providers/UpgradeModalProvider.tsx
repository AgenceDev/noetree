"use client";

import { createContext, ReactNode, useContext, useMemo, useState } from "react";

import UpgradeModal from "@/components/UpgradeModal";

interface UpgradeModalContextType {
  isOpen: boolean;
  open: () => void;
  close: () => void;
}

const UpgradeModalContext = createContext<UpgradeModalContextType | null>(null);

export function UpgradeModalProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);

  const value = useMemo(
    () => ({
      isOpen,
      open: () => setIsOpen(true),
      close: () => setIsOpen(false),
    }),
    [isOpen],
  );

  return (
    <UpgradeModalContext.Provider value={value}>
      {children}
      <UpgradeModal open={isOpen} onOpenChange={setIsOpen} />
    </UpgradeModalContext.Provider>
  );
}

export function useUpgradeModal() {
  const context = useContext(UpgradeModalContext);
  if (!context) {
    throw new Error(
      "useUpgradeModal must be used within an UpgradeModalProvider",
    );
  }
  return context;
}
