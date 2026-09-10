import React, { useEffect, useRef } from 'react';
import * as SH from './shaders';

/**
 * A self-running fluid field, played behind the confirmation screen.
 *
 * Adapted from SplashCursor on reactbits.dev (MIT), itself based on Pavel
 * Dobryakov's WebGL fluid simulation. Two things are different here:
 *
 *   1. It drives itself. The original only injects dye where a pointer moves,
 *      so on a phone it does nothing until someone smears the screen, and on a
 *      confirmation page nobody is moving a cursor -- they are reading. Virtual
 *      emitters wander along Lissajous paths instead, which never repeat exactly
 *      because each axis runs at its own irrational-ish frequency.
 *   2. The colour comes from the connect3 palette rather than a random rainbow.
 *      Random hues wander through greens and browns that are not ours; sampling
 *      the brand hues keeps every frame recognisably connect3 while still
 *      showing several colours at once.
 *
 * Fails quietly: no WebGL, or a visitor who has asked for reduced motion, and it
 * renders nothing at all rather than a black rectangle.
 */

// Brand hues as HSV h in 0..1, from the tokens in index.css.
const C3_HUES = [
  0.714, // purple  257deg
  0.697, // lavender 251deg
  0.944, // pink    340deg
  0.125, // yellow   45deg
  0.583, // blue    210deg
];

const DEFAULTS = {
  SIM_RESOLUTION: 128,
  DYE_RESOLUTION: 1024,
  DENSITY_DISSIPATION: 2.6,
  VELOCITY_DISSIPATION: 1.6,
  PRESSURE: 0.1,
  PRESSURE_ITERATIONS: 20,
  CURL: 12,
  SPLAT_RADIUS: 0.22,
  SPLAT_FORCE: 5200,
  SHADING: true,
  EMITTERS: 3,
  INTENSITY: 0.16,
};

function prefersReducedMotion() {
  return typeof window !== 'undefined'
    && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

function hsvToRgb(h, s, v) {
  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);
  switch (i % 6) {
    case 0: return { r: v, g: t, b: p };
    case 1: return { r: q, g: v, b: p };
    case 2: return { r: p, g: v, b: t };
    case 3: return { r: p, g: q, b: v };
    case 4: return { r: t, g: p, b: v };
    default: return { r: v, g: p, b: q };
  }
}

/**
 * The emitters, as a formation rather than a set of independent wanderers.
 *
 * Independent paths look fine most of the time, but across random seeds they
 * periodically fall into step and travel as a single blob -- measured at about
 * one arrangement in fourteen -- which throws away the point of running several
 * colours at once. Even giving each its own frequency band only halved it,
 * because differing rotation speeds still let the angles converge eventually.
 *
 * So the rotation is shared and the angular offsets are fixed. Each emitter
 * holds its own slice of the circle for good, and since the per-emitter wobble
 * is bounded well below the spacing, two can never meet. The organic quality
 * comes from the radius breathing at its own rate and the angular wobble on
 * top, neither of which can close the gap.
 */
function makeEmitters(total) {
  const rand = (a, b) => a + Math.random() * (b - a);
  // One rotation for the whole formation, so the spacing is preserved.
  const spin = rand(0.09, 0.15) * (Math.random() < 0.5 ? 1 : -1);
  const spacing = (Math.PI * 2) / total;
  // Keep every wobble under a third of the gap: two neighbours wobbling towards
  // each other still leave two thirds of the spacing between them.
  const maxWobble = spacing / 3;

  return Array.from({ length: total }, (_, index) => ({
    hue: index % C3_HUES.length,
    hueDrift: rand(0.02, 0.06),
    angle0: index * spacing,
    spin,
    angleWobble: rand(maxWobble * 0.4, maxWobble),
    angleWobbleFreq: rand(0.11, 0.19),
    // Elliptical, and wide enough to sweep past the ticket card.
    ax: rand(0.34, 0.44),
    ay: rand(0.3, 0.4),
    // The radius breathes, so they do not trace a fixed ring.
    rBase: rand(0.62, 0.82),
    rWobble: rand(0.16, 0.3),
    rFreq: rand(0.07, 0.13),
    rPhase: rand(0, Math.PI * 2),
    prevX: 0.5,
    prevY: 0.5,
    seeded: false,
  }));
}

function emitterPosition(e, t) {
  const angle = e.angle0 + e.spin * t + e.angleWobble * Math.sin(e.angleWobbleFreq * t + e.rPhase);
  const radius = e.rBase + e.rWobble * Math.sin(e.rFreq * t + e.rPhase);
  const x = 0.5 + e.ax * radius * Math.cos(angle);
  const y = 0.5 + e.ay * radius * Math.sin(angle);
  return { x, y };
}

export default function FluidCelebration({ className = '', ...overrides }) {
  const canvasRef = useRef(null);
  const frameRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || prefersReducedMotion()) return undefined;

    const config = { ...DEFAULTS, ...overrides };
    // A full-resolution dye texture on a phone costs more than it shows.
    if (window.innerWidth < 640) config.DYE_RESOLUTION = 512;

    const params = { alpha: true, depth: false, stencil: false, antialias: false, preserveDrawingBuffer: false };
    let gl = canvas.getContext('webgl2', params);
    const isWebGL2 = !!gl;
    if (!gl) gl = canvas.getContext('webgl', params) || canvas.getContext('experimental-webgl', params);
    // Older machines and locked-down browsers simply get the static backdrop.
    if (!gl) return undefined;

    let halfFloat;
    let supportLinearFiltering;
    if (isWebGL2) {
      gl.getExtension('EXT_color_buffer_float');
      supportLinearFiltering = gl.getExtension('OES_texture_float_linear');
    } else {
      halfFloat = gl.getExtension('OES_texture_half_float');
      supportLinearFiltering = gl.getExtension('OES_texture_half_float_linear');
    }
    gl.clearColor(0, 0, 0, 1);
    const halfFloatTexType = isWebGL2 ? gl.HALF_FLOAT : halfFloat && halfFloat.HALF_FLOAT_OES;

    function supportRenderTextureFormat(internalFormat, format, type) {
      const texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, 4, 4, 0, format, type, null);
      const fbo = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
      return gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    }

    function getSupportedFormat(internalFormat, format, type) {
      if (!supportRenderTextureFormat(internalFormat, format, type)) {
        if (internalFormat === gl.R16F) return getSupportedFormat(gl.RG16F, gl.RG, type);
        if (internalFormat === gl.RG16F) return getSupportedFormat(gl.RGBA16F, gl.RGBA, type);
        return null;
      }
      return { internalFormat, format };
    }

    const ext = isWebGL2
      ? {
          formatRGBA: getSupportedFormat(gl.RGBA16F, gl.RGBA, halfFloatTexType),
          formatRG: getSupportedFormat(gl.RG16F, gl.RG, halfFloatTexType),
          formatR: getSupportedFormat(gl.R16F, gl.RED, halfFloatTexType),
          halfFloatTexType,
          supportLinearFiltering,
        }
      : {
          formatRGBA: getSupportedFormat(gl.RGBA, gl.RGBA, halfFloatTexType),
          formatRG: getSupportedFormat(gl.RGBA, gl.RGBA, halfFloatTexType),
          formatR: getSupportedFormat(gl.RGBA, gl.RGBA, halfFloatTexType),
          halfFloatTexType,
          supportLinearFiltering,
        };

    if (!ext.formatRGBA) return undefined;
    if (!ext.supportLinearFiltering) {
      config.DYE_RESOLUTION = Math.min(config.DYE_RESOLUTION, 256);
      config.SHADING = false;
    }

    function compileShader(type, source, keywords) {
      const withKeywords = keywords
        ? keywords.map((k) => `#define ${k}\n`).join('') + source
        : source;
      const shader = gl.createShader(type);
      gl.shaderSource(shader, withKeywords);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error('[fluid]', gl.getShaderInfoLog(shader));
      }
      return shader;
    }

    function createProgram(vs, fs) {
      const program = gl.createProgram();
      gl.attachShader(program, vs);
      gl.attachShader(program, fs);
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        console.error('[fluid]', gl.getProgramInfoLog(program));
      }
      return program;
    }

    function getUniforms(program) {
      const uniforms = {};
      const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
      for (let i = 0; i < count; i++) {
        const name = gl.getActiveUniform(program, i).name;
        uniforms[name] = gl.getUniformLocation(program, name);
      }
      return uniforms;
    }

    function makeProgram(vs, fs) {
      const program = createProgram(vs, fs);
      return { program, uniforms: getUniforms(program), bind: () => gl.useProgram(program) };
    }

    const vs = compileShader(gl.VERTEX_SHADER, SH.baseVertex);
    const copyProgram = makeProgram(vs, compileShader(gl.FRAGMENT_SHADER, SH.copy));
    const clearProgram = makeProgram(vs, compileShader(gl.FRAGMENT_SHADER, SH.clear));
    const splatProgram = makeProgram(vs, compileShader(gl.FRAGMENT_SHADER, SH.splat));
    const advectionProgram = makeProgram(
      vs,
      compileShader(gl.FRAGMENT_SHADER, SH.advection, ext.supportLinearFiltering ? null : ['MANUAL_FILTERING']),
    );
    const divergenceProgram = makeProgram(vs, compileShader(gl.FRAGMENT_SHADER, SH.divergence));
    const curlProgram = makeProgram(vs, compileShader(gl.FRAGMENT_SHADER, SH.curl));
    const vorticityProgram = makeProgram(vs, compileShader(gl.FRAGMENT_SHADER, SH.vorticity));
    const pressureProgram = makeProgram(vs, compileShader(gl.FRAGMENT_SHADER, SH.pressure));
    const gradientProgram = makeProgram(vs, compileShader(gl.FRAGMENT_SHADER, SH.gradientSubtract));
    const displayProgram = makeProgram(
      vs,
      compileShader(gl.FRAGMENT_SHADER, SH.display, config.SHADING ? ['SHADING'] : null),
    );

    const blit = (() => {
      gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, -1, 1, 1, 1, 1, -1]), gl.STATIC_DRAW);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([0, 1, 2, 0, 2, 3]), gl.STATIC_DRAW);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      gl.enableVertexAttribArray(0);
      return (target, clearFirst = false) => {
        if (target == null) {
          gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
          gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        } else {
          gl.viewport(0, 0, target.width, target.height);
          gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
        }
        if (clearFirst) {
          gl.clearColor(0, 0, 0, 1);
          gl.clear(gl.COLOR_BUFFER_BIT);
        }
        gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
      };
    })();

    function createFBO(w, h, internalFormat, format, type, param) {
      gl.activeTexture(gl.TEXTURE0);
      const texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, param);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, param);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, w, h, 0, format, type, null);

      const fbo = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
      gl.viewport(0, 0, w, h);
      gl.clear(gl.COLOR_BUFFER_BIT);

      return {
        texture, fbo, width: w, height: h,
        texelSizeX: 1 / w, texelSizeY: 1 / h,
        attach(id) {
          gl.activeTexture(gl.TEXTURE0 + id);
          gl.bindTexture(gl.TEXTURE_2D, texture);
          return id;
        },
      };
    }

    function createDoubleFBO(w, h, internalFormat, format, type, param) {
      let fbo1 = createFBO(w, h, internalFormat, format, type, param);
      let fbo2 = createFBO(w, h, internalFormat, format, type, param);
      return {
        width: w, height: h,
        texelSizeX: fbo1.texelSizeX, texelSizeY: fbo1.texelSizeY,
        get read() { return fbo1; },
        set read(v) { fbo1 = v; },
        get write() { return fbo2; },
        set write(v) { fbo2 = v; },
        swap() { const t = fbo1; fbo1 = fbo2; fbo2 = t; },
      };
    }

    function getResolution(resolution) {
      let aspect = gl.drawingBufferWidth / gl.drawingBufferHeight;
      if (aspect < 1) aspect = 1 / aspect;
      const min = Math.round(resolution);
      const max = Math.round(resolution * aspect);
      return gl.drawingBufferWidth > gl.drawingBufferHeight
        ? { width: max, height: min }
        : { width: min, height: max };
    }

    let dye;
    let velocity;
    let divergenceFBO;
    let curlFBO;
    let pressureFBO;

    function initFramebuffers() {
      const simRes = getResolution(config.SIM_RESOLUTION);
      const dyeRes = getResolution(config.DYE_RESOLUTION);
      const texType = ext.halfFloatTexType;
      const { formatRGBA: rgba, formatRG: rg, formatR: r } = ext;
      const filtering = ext.supportLinearFiltering ? gl.LINEAR : gl.NEAREST;
      gl.disable(gl.BLEND);

      dye = createDoubleFBO(dyeRes.width, dyeRes.height, rgba.internalFormat, rgba.format, texType, filtering);
      velocity = createDoubleFBO(simRes.width, simRes.height, rg.internalFormat, rg.format, texType, filtering);
      divergenceFBO = createFBO(simRes.width, simRes.height, r.internalFormat, r.format, texType, gl.NEAREST);
      curlFBO = createFBO(simRes.width, simRes.height, r.internalFormat, r.format, texType, gl.NEAREST);
      pressureFBO = createDoubleFBO(simRes.width, simRes.height, r.internalFormat, r.format, texType, gl.NEAREST);
    }

    function resizeCanvas() {
      const ratio = window.devicePixelRatio || 1;
      // Cap the pixel ratio: a 3x phone screen triples the fragment work for a
      // blurred field nobody is inspecting closely.
      const scale = Math.min(ratio, 2);
      const width = Math.floor(canvas.clientWidth * scale);
      const height = Math.floor(canvas.clientHeight * scale);
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
        return true;
      }
      return false;
    }

    function correctRadius(radius) {
      const aspect = canvas.width / canvas.height;
      return aspect > 1 ? radius * aspect : radius;
    }

    function splat(x, y, dx, dy, color) {
      splatProgram.bind();
      gl.uniform1i(splatProgram.uniforms.uTarget, velocity.read.attach(0));
      gl.uniform1f(splatProgram.uniforms.aspectRatio, canvas.width / canvas.height);
      gl.uniform2f(splatProgram.uniforms.point, x, y);
      gl.uniform3f(splatProgram.uniforms.color, dx, dy, 0);
      gl.uniform1f(splatProgram.uniforms.radius, correctRadius(config.SPLAT_RADIUS / 100));
      blit(velocity.write);
      velocity.swap();

      gl.uniform1i(splatProgram.uniforms.uTarget, dye.read.attach(0));
      gl.uniform3f(splatProgram.uniforms.color, color.r, color.g, color.b);
      blit(dye.write);
      dye.swap();
    }

    function step(dt) {
      gl.disable(gl.BLEND);

      curlProgram.bind();
      gl.uniform2f(curlProgram.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
      gl.uniform1i(curlProgram.uniforms.uVelocity, velocity.read.attach(0));
      blit(curlFBO);

      vorticityProgram.bind();
      gl.uniform2f(vorticityProgram.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
      gl.uniform1i(vorticityProgram.uniforms.uVelocity, velocity.read.attach(0));
      gl.uniform1i(vorticityProgram.uniforms.uCurl, curlFBO.attach(1));
      gl.uniform1f(vorticityProgram.uniforms.curl, config.CURL);
      gl.uniform1f(vorticityProgram.uniforms.dt, dt);
      blit(velocity.write);
      velocity.swap();

      divergenceProgram.bind();
      gl.uniform2f(divergenceProgram.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
      gl.uniform1i(divergenceProgram.uniforms.uVelocity, velocity.read.attach(0));
      blit(divergenceFBO);

      clearProgram.bind();
      gl.uniform1i(clearProgram.uniforms.uTexture, pressureFBO.read.attach(0));
      gl.uniform1f(clearProgram.uniforms.value, config.PRESSURE);
      blit(pressureFBO.write);
      pressureFBO.swap();

      pressureProgram.bind();
      gl.uniform2f(pressureProgram.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
      gl.uniform1i(pressureProgram.uniforms.uDivergence, divergenceFBO.attach(0));
      for (let i = 0; i < config.PRESSURE_ITERATIONS; i++) {
        gl.uniform1i(pressureProgram.uniforms.uPressure, pressureFBO.read.attach(1));
        blit(pressureFBO.write);
        pressureFBO.swap();
      }

      gradientProgram.bind();
      gl.uniform2f(gradientProgram.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
      gl.uniform1i(gradientProgram.uniforms.uPressure, pressureFBO.read.attach(0));
      gl.uniform1i(gradientProgram.uniforms.uVelocity, velocity.read.attach(1));
      blit(velocity.write);
      velocity.swap();

      advectionProgram.bind();
      gl.uniform2f(advectionProgram.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
      if (!ext.supportLinearFiltering) {
        gl.uniform2f(advectionProgram.uniforms.dyeTexelSize, velocity.texelSizeX, velocity.texelSizeY);
      }
      const velocityId = velocity.read.attach(0);
      gl.uniform1i(advectionProgram.uniforms.uVelocity, velocityId);
      gl.uniform1i(advectionProgram.uniforms.uSource, velocityId);
      gl.uniform1f(advectionProgram.uniforms.dt, dt);
      gl.uniform1f(advectionProgram.uniforms.dissipation, config.VELOCITY_DISSIPATION);
      blit(velocity.write);
      velocity.swap();

      if (!ext.supportLinearFiltering) {
        gl.uniform2f(advectionProgram.uniforms.dyeTexelSize, dye.texelSizeX, dye.texelSizeY);
      }
      gl.uniform1i(advectionProgram.uniforms.uVelocity, velocity.read.attach(0));
      gl.uniform1i(advectionProgram.uniforms.uSource, dye.read.attach(1));
      gl.uniform1f(advectionProgram.uniforms.dissipation, config.DENSITY_DISSIPATION);
      blit(dye.write);
      dye.swap();
    }

    function render() {
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.enable(gl.BLEND);
      displayProgram.bind();
      if (config.SHADING) {
        gl.uniform2f(displayProgram.uniforms.texelSize, 1 / gl.drawingBufferWidth, 1 / gl.drawingBufferHeight);
      }
      gl.uniform1i(displayProgram.uniforms.uTexture, dye.read.attach(0));
      blit(null);
    }

    // ---- the part that makes it run on its own -----------------------------

    const emitters = makeEmitters(config.EMITTERS);

    function emitterColor(e, t) {
      // Walk slowly along the palette rather than jumping, so neighbouring
      // ribbons blend instead of banding.
      const pos = e.hue + t * e.hueDrift;
      const i = Math.floor(pos) % C3_HUES.length;
      const next = (i + 1) % C3_HUES.length;
      const mix = pos - Math.floor(pos);
      let a = C3_HUES[i];
      let b = C3_HUES[next];
      // Interpolate the short way around the colour wheel.
      if (Math.abs(b - a) > 0.5) b += b < a ? 1 : -1;
      const hue = (a + (b - a) * mix + 1) % 1;
      const c = hsvToRgb(hue, 0.85, 1);
      return { r: c.r * config.INTENSITY, g: c.g * config.INTENSITY, b: c.b * config.INTENSITY };
    }

    function driveEmitters(t) {
      for (const e of emitters) {
        const { x, y } = emitterPosition(e, t);
        if (!e.seeded) {
          // Do not splat on the first frame: prevX/prevY are still the centre,
          // which would fire one huge jet from the middle of the screen.
          e.prevX = x;
          e.prevY = y;
          e.seeded = true;
          continue;
        }
        const dx = (x - e.prevX) * config.SPLAT_FORCE;
        const dy = (y - e.prevY) * config.SPLAT_FORCE;
        e.prevX = x;
        e.prevY = y;
        splat(x, y, dx, dy, emitterColor(e, t));
      }
    }

    // ---- loop --------------------------------------------------------------

    let running = true;
    let ready = false;
    let lastTime = performance.now();
    let elapsed = 0;

    /**
     * True once the canvas has real dimensions.
     *
     * It can legitimately be zero for a while: a collapsed pane, a hidden tab,
     * or a parent still laying out. Building framebuffers at that point divides
     * by a zero drawing buffer and produces NaN-sized textures that never
     * recover, so wait instead.
     */
    function haveSize() {
      return canvas.clientWidth > 0 && canvas.clientHeight > 0;
    }

    function frame(now) {
      if (!running) return;
      frameRef.current = requestAnimationFrame(frame);

      if (!haveSize()) {
        // Keep the clock with the wall, or the first real frame arrives with a
        // delta covering however long the pane was collapsed.
        lastTime = now;
        return;
      }

      const resized = resizeCanvas();
      if (!ready || resized) {
        initFramebuffers();
        ready = true;
      }

      let dt = (now - lastTime) / 1000;
      // Clamp: a backgrounded tab returns with a huge delta that detonates the
      // simulation.
      dt = Math.min(Math.max(dt, 0.0001), 0.016666);
      lastTime = now;
      elapsed += dt;

      driveEmitters(elapsed);
      step(dt);
      render();
    }

    // No point simulating a field nobody can see.
    function onVisibility() {
      if (document.hidden) {
        running = false;
        if (frameRef.current) cancelAnimationFrame(frameRef.current);
      } else if (!running) {
        running = true;
        lastTime = performance.now();
        frameRef.current = requestAnimationFrame(frame);
      }
    }
    document.addEventListener('visibilitychange', onVisibility);

    frameRef.current = requestAnimationFrame(frame);

    return () => {
      running = false;
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      document.removeEventListener('visibilitychange', onVisibility);
      // Drop the GPU resources rather than waiting for the context to be
      // garbage collected, which browsers do lazily and cap at ~16 contexts.
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div aria-hidden="true" className={`pointer-events-none fixed inset-0 ${className}`}>
      <canvas ref={canvasRef} className="w-full h-full block" />
    </div>
  );
}
