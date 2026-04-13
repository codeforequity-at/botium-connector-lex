import json from 'rollup-plugin-json'

export default {
  input: 'index.js',
  external: (id) => !id.startsWith('.') && !id.startsWith('/') && !id.startsWith('\0'),
  output: [
    {
      file: 'dist/botium-connector-lex-es.js',
      format: 'es',
      sourcemap: true
    },
    {
      file: 'dist/botium-connector-lex-cjs.cjs',
      format: 'cjs',
      exports: 'auto',
      sourcemap: true
    }
  ],
  plugins: [
    json()
  ]
}
