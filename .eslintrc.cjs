/** @type {import("@types/eslint").Linter.Config} */

module.exports = {
  /**
   * References:
   *
   * https://github.com/JulianCataldo/web-garden/blob/develop/configs/eslint-js.cjs
   * https://github.com/JulianCataldo/web-garden/blob/develop/configs/eslint-ts.cjs
   *
   * */
  extends: [
    './node_modules/webdev-configs/eslint-js.cjs',
    './node_modules/webdev-configs/eslint-ts.cjs',
  ],
};
