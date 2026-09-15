/** @type {import('eslint').Linter.Config} */
module.exports = {
	root: true,
	env: { es6: true, node: true },
	parser: '@typescript-eslint/parser',
	parserOptions: { project: ['./tsconfig.json'], sourceType: 'module' },
	plugins: ['@typescript-eslint'],
	extends: ['plugin:@typescript-eslint/recommended'],
	ignorePatterns: ['dist/**', 'node_modules/**', 'test/**', 'scripts/**'],
	rules: {
		'@typescript-eslint/no-explicit-any': 'warn',
		'@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
	},
};
