import tsEslint from 'typescript-eslint';
import prettierPlugin from 'eslint-plugin-prettier';
import prettierConfig from 'eslint-config-prettier';

module.exports = [
  // 1. Specify the directories/files that do not need to be checked for errors.
  {
    ignores: ['node_modules/', 'dist/', 'uploads/', 'package*.json'],
  },
  // 2. Use the recommended configuration for TypeScript
  ...tsEslint.configs.recommended,
  // 3. Cấu hình luật tùy chỉnh và tích hợp Prettier
  {
    files: ['src/**/*.ts'],
    plugins: {
      prettier: prettierPlugin,
    },
    rules: {
      // Force a format check according to Prettier; if incorrect, a red error will be displayed.
      'prettier/prettier': 'error',
      
      // Allow warnings instead of blocking when using the 'any' data type
      '@typescript-eslint/no-explicit-any': 'warn',
      
      // Report an error if a variable is declared but not used (except for variables with an underscore at the beginning).
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      
      // Force limited use of console.log in production
      'no-console': 'warn',
    },
  },
  // 4. Apply the Prettier conflict blocking configuration at the end.
  prettierConfig,
];