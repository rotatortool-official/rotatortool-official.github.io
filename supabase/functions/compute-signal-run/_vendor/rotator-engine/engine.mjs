/* ESM view of engine.js — no logic here, and deliberately so.
   ONE copy of the scoring code has to serve three runtimes, and they
   disagree about what a `.js` file is:

     Deno (Supabase edge)  treats it as ESM. `module` is undefined, so the
                           UMD wrapper takes its global branch and assigns
                           globalThis.RotatorEngine.
     Node (the bot)        treats it as CommonJS. The UMD wrapper takes the
                           module.exports branch, which surfaces here as the
                           dynamic import's `default`.
     Browser (the site)    loads engine.js directly with a <script> tag and
                           never touches this file.

   Taking whichever of the two the host produced keeps both correct without
   a build step or a second copy of the engine. */
const ns = await import('./engine.js');
const Engine = ns.default || globalThis.RotatorEngine;

if (!Engine || typeof Engine.computeSignalRun !== 'function') {
  throw new Error('rotator-engine: engine.js did not expose computeSignalRun via either module.exports or globalThis.RotatorEngine');
}

export const ENGINE_VERSION = Engine.ENGINE_VERSION;
export const computeSignalRun = Engine.computeSignalRun;
export const internals = Engine.internals;
export default Engine;
