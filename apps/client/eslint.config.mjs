import js from '@eslint/js'
import vue from 'eslint-plugin-vue'
import tseslint from 'typescript-eslint'
import vueParser from 'vue-eslint-parser'

export default [
  { ignores: ['dist/**', 'release/**', 'output/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...vue.configs['flat/recommended'],
  {
    files: ['**/*.vue'],
    languageOptions: {
      parser: vueParser,
      parserOptions: {
        parser: tseslint.parser,
        extraFileExtensions: ['.vue'],
      },
    },
  },
  {
    files: ['**/*.ts', '**/*.vue'],
    rules: {
      'no-undef': 'off',
      "@typescript-eslint/no-unused-expressions": 'off',
      // Route and shadcn component filenames intentionally use single-word names.
      'vue/multi-word-component-names': 'off',
    },
  },
  {
    files: ['tailwind.config.js'],
    languageOptions: {
      globals: {
        module: 'readonly',
      },
    },
  },
]
