import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "@/App";
// Los tokens y los estilos globales, una sola vez y en la raiz: cualquier otro sitio
// haria que el orden de la cascada dependiera del orden de importacion de las pantallas.
import "@/ds/global.css";

const raiz = document.getElementById("raiz");
if (raiz === null) {
  throw new Error("Falta el elemento #raiz en index.html");
}

createRoot(raiz).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
