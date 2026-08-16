import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import CyclingDashboard from "../app/CyclingDashboard";
import "../app/globals.css";

const root = document.getElementById("root");
if (!root) throw new Error("Cycling Analytics could not find its application root.");

createRoot(root).render(
  <StrictMode>
    <CyclingDashboard />
  </StrictMode>,
);
