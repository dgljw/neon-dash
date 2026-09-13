/**
 * Real Three.js with a stubbed WebGLRenderer.
 *
 * Local (explicit) exports take precedence over `export *`, so the
 * WebGLRenderer declared here shadows the real one.
 */
export * from '../vendor/three.module.min.js';
import * as REAL from '../vendor/three.module.min.js';

export class WebGLRenderer {
  constructor(params = {}) {
    this.domElement = params.canvas || { style: {} };
    this.params = params;
    this.capabilities = { getMaxAnisotropy: () => 4, isWebGL2: true };
    this.info = { render: {}, memory: {}, programs: [] };
    this.shadowMap = { enabled: false };
    this.xr = { enabled: false };
    this.state = { reset() {} };
    this.renderCount = 0;
    this.pixelRatio = 1;
  }
  setPixelRatio(v) { this.pixelRatio = v; }
  getPixelRatio() { return this.pixelRatio; }
  setSize() {}
  setViewport() {}
  setScissor() {}
  setScissorTest() {}
  setClearColor() {}
  setClearAlpha() {}
  clear() {}
  dispose() {}
  getContext() { return {}; }
  compile() {}
  render() { this.renderCount++; }
  renderAsync() { this.renderCount++; return Promise.resolve(); }
  setAnimationLoop() {}
  setOpaqueSort() {}
  setTransparentSort() {}
}

export const __isThreeStub = true;
