import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "release/**",
    "next-env.d.ts",
    // Vendored FFmpeg WASM glue prepared by scripts/prepare-ffmpeg-assets.mjs.
    // These are minified third-party assets (gitignored) and must not be linted.
    "public/ffmpeg-core/**",
    "public/ffmpeg-core-mt/**",
  ]),
]);

export default eslintConfig;
