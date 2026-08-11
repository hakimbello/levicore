import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./app/App";
import { applyDesignTokens } from "./design";
import "./styles/global.css";
import "./styles/activity-bar.css";

applyDesignTokens();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
