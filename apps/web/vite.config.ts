import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/** GitHub Pages: https://kibri-bsq.github.io/test-repo/ */
const githubPagesRepo = "test-repo";

export default defineConfig(({ command }) => ({
  plugins: [react()],
  base: command === "build" ? `/${githubPagesRepo}/` : "/",
}));
