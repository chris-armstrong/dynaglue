import typescript from '@rollup/plugin-typescript';
import sourceMaps from 'rollup-plugin-sourcemaps';
import commonjs from '@rollup/plugin-commonjs';
import resolve from '@rollup/plugin-node-resolve';
import camelCase from 'lodash/camelCase';

const pkg = require('./package.json');

const libraryName = 'dynaglue';

export default {
  input: 'index.ts',
  output: { file: pkg.main, name: camelCase(libraryName), format: 'umd', sourcemap: true },
  external: ['aws-sdk', 'lodash', 'debug', 'verror'],
  plugins: [
    typescript(),
    commonjs(),
    resolve(),
    sourceMaps(),
  ],
};
