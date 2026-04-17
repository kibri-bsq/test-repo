import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/** GitHub Pages: https://kibri-bsq.github.io/compute-engine/ */
const githubPagesRepo = "compute-engine";

export default defineConfig(({ command }) => ({
  plugins: [react()],
  base: command === "build" ? `/${githubPagesRepo}/` : "/",
}));
