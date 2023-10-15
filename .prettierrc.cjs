/** @type {import("prettier").Options} */

module.exports = {
	/**
	 * Reference:
	 *
	 * https://github.com/JulianCataldo/web-garden/blob/develop/configs/prettier-base.cjs
	 *
	 * */
	...require('webdev-configs/prettier-base.cjs'),

	overrides: [
		{
			files: ['*.json', '*.yaml'],
			options: {
				useTabs: false,
			},
		},
	],
};
