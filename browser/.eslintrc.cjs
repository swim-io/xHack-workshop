require("@swim-io/eslint-config/patch/modern-module-resolution.cjs");

module.exports = {
  root: true,
  overrides: [
    {
      files: ["**/*.{cjs,js,mjs}"],
      extends: ["@swim-io/eslint-config"],
    },
    {
      files: ["**/*.{cts,mts,ts,tsx}"],
      extends: ["@swim-io/eslint-config/react"],
      parserOptions: {
        tsconfigRootDir: __dirname,
      },
      rules: {
        "import/extensions": "off",
        "i18next/no-literal-string": "off",
        "@sayari/no-unwrapped-jsx-text": "off",
      },
    },
  ],
};
