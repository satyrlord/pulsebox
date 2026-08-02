import eslint from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

/**
 * Layer names, not paths. A relative specifier carries one `../` per directory
 * of nesting, so a literal `../engine/**` only ever matched a file sitting
 * directly under `src/`. The patterns below climb any number of levels and then
 * anchor on the layer directory, so the guard holds at any depth without also
 * matching a same-named subdirectory such as `src/state/persistence/`.
 */
const RELATIVE_DEPTHS = ["..", "../..", "../../..", "../../../..", "../../../../.."];

const restricted = (layers) => [
  "error",
  {
    patterns: layers.map((layer) => ({
      group: RELATIVE_DEPTHS.flatMap((prefix) => [`${prefix}/${layer}`, `${prefix}/${layer}/**`]),
      message: "Import through the owning layer's public port instead.",
    })),
  },
];

export default tseslint.config(
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      "playwright-report/**",
      "test-results/**",
      "docs/design/**",
      "tmp/**",
      "tmp-*/**",
      "eslint.config.mjs",
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  reactHooks.configs.flat.recommended,
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
      // Numbers in template literals are ordinary; CSS Module class lookups are
      // `string | undefined` only because of noUncheckedIndexedAccess.
      "@typescript-eslint/restrict-template-expressions": [
        "error",
        { allowNumber: true, allowNever: false },
      ],
    },
  },
  {
    // Fast Refresh only works when a module's exports are all components.
    files: ["src/ui/**/*.tsx"],
    plugins: { "react-refresh": reactRefresh },
    rules: {
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
    },
  },
  {
    files: ["src/contracts/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": restricted([
        "engine",
        "state",
        "persistence",
        "styles",
        "themes",
        "ui",
      ]),
    },
  },
  {
    files: ["src/state/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": restricted(["engine", "persistence", "styles", "themes", "ui"]),
    },
  },
  {
    files: ["src/engine/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": restricted(["persistence", "state", "styles", "themes", "ui"]),
    },
  },
  {
    // Persistence adapts a browser store behind a state-owned port, so it may
    // reach state but never the engine or the UI.
    files: ["src/persistence/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": restricted(["engine", "styles", "themes", "ui"]),
    },
  },
  {
    // `src/themes/` is part of the UI layer boundary, so it carries the same
    // restrictions as `src/ui/`.
    files: ["src/ui/**/*.{ts,tsx}", "src/themes/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": restricted(["engine", "persistence"]),
    },
  },
);
