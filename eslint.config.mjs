import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default [
  {
    ignores: ["**/.next/**", "coverage/**", "node_modules/**", "**/dist/**", "playwright-report/**", "test-results/**"]
  },
  js.configs.recommended,
  {
    languageOptions: {
      globals: {
        clearTimeout: "readonly",
        console: "readonly",
        fetch: "readonly",
        process: "readonly",
        setTimeout: "readonly"
      }
    }
  },
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      globals: {
        console: "readonly",
        process: "readonly",
        React: "readonly"
      },
      parserOptions: {
        tsconfigRootDir: import.meta.dirname
      }
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/triple-slash-reference": "off"
    }
  }
];
