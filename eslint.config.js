import babelParser from "@babel/eslint-parser";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";

const sharedGlobals = {
  ...globals.browser,
  ...globals.node,
};

const sharedRules = {
  // TypeScript and Babel parse the source; these core rules do not
  // understand type-only usage, so tsc owns correctness here.
  "no-undef": "off",
  "no-unused-vars": "off",
  "no-debugger": "error",
  "no-unreachable": "error",
  "no-dupe-args": "error",
  "no-dupe-keys": "error",
  "no-dupe-class-members": "error",
  "no-constant-condition": "warn",
  "no-redeclare": "warn",
  "react-hooks/rules-of-hooks": "error",
  "react-hooks/exhaustive-deps": "warn",
};

function parserOptions({ jsx = false } = {}) {
  return {
    requireConfigFile: false,
    babelOptions: {
      presets: ["@babel/preset-typescript"],
      plugins: jsx ? ["@babel/plugin-syntax-jsx"] : [],
    },
    sourceType: "module",
  };
}

export default [
  {
    ignores: [
      "node_modules/**",
      "dist/**",
      "data/**",
      "backups/**",
      "test-results/**",
      "playwright-report/**",
    ],
  },
  {
    files: ["**/*.tsx"],
    languageOptions: {
      parser: babelParser,
      parserOptions: parserOptions({ jsx: true }),
      globals: sharedGlobals,
    },
    plugins: { "react-hooks": reactHooks },
    rules: sharedRules,
  },
  {
    files: ["**/*.{ts,js,mjs}"],
    languageOptions: {
      parser: babelParser,
      parserOptions: parserOptions(),
      globals: sharedGlobals,
    },
    plugins: { "react-hooks": reactHooks },
    rules: sharedRules,
  },
];
