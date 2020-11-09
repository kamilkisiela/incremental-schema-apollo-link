const { resolve } = require("path");

module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  rootDir: __dirname,
  globals: {
    "ts-jest": {
      tsconfig: resolve(__dirname, "tsconfig.test.json"),
    },
  },
  reporters: ["default"],
  modulePathIgnorePatterns: ["dist"],
};
