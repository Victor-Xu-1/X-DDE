import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { initializeTheme } from "./theme";
import { MoleculeDrawingProvider } from "./presentation/MoleculeImage";
import "./styles.css";
import "./studio.css";
import "./guided.css";
import "./workflow.css";
import "./design.css";

const stopThemeSync = initializeTheme();
if (import.meta.hot) import.meta.hot.dispose(stopThemeSync);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <MoleculeDrawingProvider>
      <App />
    </MoleculeDrawingProvider>
  </StrictMode>,
);
