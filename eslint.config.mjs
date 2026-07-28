import eslint from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

const restricted = (patterns) => [
  "error",
  {
    patterns: patterns.map((group) => ({
      group: [group],
      message: "Import through the owning layer's public port instead.",
    })),
  },
];

export default tseslint.config(
  {
    ignores: ["dist/**", "node_modules/**", "playwright-report/**", "test-results/**", "design/**", "tmp/**", "tmp-*/**", "eslint.config.mjs"],
  },
  eslint.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: ["*.mjs", "scripts/*.mjs"],
        },
        tsconfigRootDir: import.meta.dirname,
      },
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    rules: {
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-confusing-void-expression": "off",
    },
  },
  {
    files: ["src/contracts/**/*.ts"],
    rules: {
      "no-restricted-imports": restricted(["../app/**", "../engine/**", "../state/**", "../persistence/**", "../ui/**"]),
    },
  },
  {
    files: ["src/state/**/*.ts"],
    rules: {
      "no-restricted-imports": restricted(["../app/**", "../engine/**", "../ui/**"]),
    },
  },
  {
    files: ["src/engine/**/*.ts"],
    rules: {
      "no-restricted-imports": restricted(["../app/**", "../persistence/**", "../state/**", "../ui/**"]),
    },
  },
  {
    files: ["src/ui/**/*.ts"],
    rules: {
      "no-restricted-imports": restricted(["../engine/**", "../persistence/**"]),
    },
  },
);
