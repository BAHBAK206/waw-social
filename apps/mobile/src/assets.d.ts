/** Font files are bundled by Metro and resolve to an asset id. */
declare module '*.otf' {
  const asset: number;
  export default asset;
}
