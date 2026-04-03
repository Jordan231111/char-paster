export default {
  sourceDir: ".",
  artifactsDir: "./dist",
  ignoreFiles: [
    "package.json",
    "package-lock.json",
    "node_modules",
    "dist",
    "web-ext-config.mjs",
    ".git",
    ".DS_Store",
  ],
  build: {
    overwriteDest: true,
  },
  run: {
    browserConsole: true,
    startUrl: ["https://example.com"],
  },
};
