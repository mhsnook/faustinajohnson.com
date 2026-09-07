// html-midi-player's package.json points `types` at dist/esm/index.d.ts, which the
// published package does not contain. It is imported purely for its side effect --
// registering the <midi-player> custom element -- so an untyped module is enough.
declare module "html-midi-player";
