import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // ~220 pre-existing `any`s (see docs/CODE_REVIEW_2026-09-11.md §8). Lint now
      // gates every PR in CI, so this is a warning until the generated Supabase
      // types replace the hand-written ones; new code should not add any.
      "@typescript-eslint/no-explicit-any": "warn",
      // React Compiler advisories (memoization hints, setState-in-effect). Worth
      // fixing over time; not worth blocking a merge.
      "react-hooks/preserve-manual-memoization": "warn",
      "react-hooks/set-state-in-effect": "warn",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
