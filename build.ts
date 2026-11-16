import pkg from './package.json';

const define = { __VERSION__: JSON.stringify(pkg.version), __BUILD_TIME__: JSON.stringify(new Date().toISOString()) };
const common = { target: 'browser', define } as const;
const results = [
    await Bun.build({ ...common, entrypoints: ['src/IabEscape.ts'], outdir: 'dist', format: 'esm' }),
    await Bun.build({ ...common, entrypoints: ['src/iife.ts'], outdir: 'dist', naming: 'iab-escape.min.js', format: 'iife', minify: true }),
];
if (results.some((r) => !r.success)) {
    console.error(results.flatMap((r) => r.logs).join('\n'));
    process.exit(1);
}
