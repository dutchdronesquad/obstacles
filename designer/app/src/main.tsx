// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Klaas Schoute

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { TooltipProvider } from "./components/ui/tooltip";
import { App } from "./App.tsx";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <TooltipProvider delayDuration={500}>
      <App />
    </TooltipProvider>
  </StrictMode>,
);
