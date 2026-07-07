import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router/dom";
import { router } from "./App";
import "./styles.css";

console.info(
  "%c你好，开发者。欢迎查看茂一杀网站源码。",
  "color:#d9ad58;font-weight:700",
);

createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
