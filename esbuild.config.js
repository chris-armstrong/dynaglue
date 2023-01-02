const esbuild = require('esbuild');
const { nodeExternalsPlugin } = require('esbuild-node-externals');

esbuild.build({
  entryPoints: ['./src/index.ts'],
  outdir: './dist',
  bundle: true,
  minify: false,
  platform: 'node',
  target: 'node12',
  plugins: [nodeExternalsPlugin()],
  sourcemap: true,
});
