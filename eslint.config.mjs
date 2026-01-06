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
    "next-env.d.ts",
  ]),
  // Global rule overrides
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "off", // Disable no-explicit-any rule globally
    },
  },
  // More lenient rules for test files
  {
    files: ["**/__tests__/**/*", "**/*.test.ts", "**/*.test.tsx"],
    rules: {
      "@typescript-eslint/no-unused-vars": "warn", // Allow unused vars in tests
    },
  },
  // Allow require() in models/index.ts for dynamic loading
  {
    files: ["models/index.ts"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
  // More lenient rules for scripts (often need any for dynamic data)
  {
    files: ["scripts/**/*.ts"],
    rules: {
      "@typescript-eslint/no-unused-vars": "warn",
    },
  },
]);

export default eslintConfig;
