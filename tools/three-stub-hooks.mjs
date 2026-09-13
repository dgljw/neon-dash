/**
 * Module resolution hook used only by tools/boot-test.mjs.
 *
 * The boot test runs the real client in jsdom, which has no WebGL. This hook
 * redirects the `three.module.min.js` import to a shim that re-exports the
 * whole library but swaps in a no-op WebGLRenderer, so every other line of the
 * game — scene graph, materials, DOM, input, state machine — runs for real.
 */
export async function resolve(specifier, context, nextResolve) {
  // never redirect the stub's own re-export, or this would recurse forever
  if (specifier.endsWith('three.module.min.js') &&
      !(context.parentURL || '').includes('three-webgl-stub')) {
    return { url: new URL('./three-webgl-stub.mjs', import.meta.url).href, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
