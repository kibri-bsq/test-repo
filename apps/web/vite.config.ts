import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/** GitHub Pages project sites live under /<repo>/; default "/" is wrong for CI builds. */
function baseForDeploy(): string {
  const repo = process.env.GITHUB_REPOSITORY?.split("/")[1];
  if (repo) return `/${repo}/`;
  return "/";
}

export default defineConfig({
  plugins: [react()],
  base: baseForDeploy(),
});
