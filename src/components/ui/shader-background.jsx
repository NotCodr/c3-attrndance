import React, { useEffect, useRef } from 'react';

/**
 * Animated plasma-and-grid shader, drawn on a full-screen canvas.
 *
 * The colours are uniforms rather than constants in the GLSL, so the same
 * shader can carry the connect3 palette instead of the stock purple-on-navy.
 * Lines are shaded across three hues by their index, which is what gives the
 * field several colours at once rather than one flat wash.
 *
 * Written as .jsx, not .tsx: this project has no TypeScript, and its
 * components.json already declares "tsx": false.
 */

// Brand hues from index.css, converted to linear-ish 0..1 RGB triples.
const C3 = {
  purple: [0.55, 0.42, 0.88],
  pink: [0.95, 0.62, 0.78],
  blue: [0.55, 0.78, 0.97],
  inkDeep: [0.05, 0.04, 0.12],
  inkPurple: [0.16, 0.07, 0.28],
};

const vsSource = `
  attribute vec4 aVertexPosition;
  void main() {
    gl_Position = aVertexPosition;
  }
`;

const fsSource = `
  precision highp float;
  uniform vec2 iResolution;
  uniform float iTime;
  uniform vec3 uLineA;
  uniform vec3 uLineB;
  uniform vec3 uLineC;
  uniform vec3 uBg1;
  uniform vec3 uBg2;
  uniform float uIntensity;

  const float overallSpeed = 0.2;
  const float gridSmoothWidth = 0.015;
  const float axisWidth = 0.05;
  const float majorLineWidth = 0.025;
  const float minorLineWidth = 0.0125;
  const float majorLineFrequency = 5.0;
  const float minorLineFrequency = 1.0;
  const float scale = 5.0;
  const float minLineWidth = 0.01;
  const float maxLineWidth = 0.2;
  const float lineSpeed = 1.0 * overallSpeed;
  const float lineAmplitude = 1.0;
  const float lineFrequency = 0.2;
  const float warpSpeed = 0.2 * overallSpeed;
  const float warpFrequency = 0.5;
  const float warpAmplitude = 1.0;
  const float offsetFrequency = 0.5;
  const float offsetSpeed = 1.33 * overallSpeed;
  const float minOffsetSpread = 0.6;
  const float maxOffsetSpread = 2.0;
  const int linesPerGroup = 16;

  #define drawCircle(pos, radius, coord) smoothstep(radius + gridSmoothWidth, radius, length(coord - (pos)))
  #define drawSmoothLine(pos, halfWidth, t) smoothstep(halfWidth, 0.0, abs(pos - (t)))
  #define drawCrispLine(pos, halfWidth, t) smoothstep(halfWidth + gridSmoothWidth, halfWidth, abs(pos - (t)))
  #define drawPeriodicLine(freq, width, t) drawCrispLine(freq / 2.0, width, abs(mod(t, freq) - (freq) / 2.0))

  float random(float t) {
    return (cos(t) + cos(t * 1.3 + 1.3) + cos(t * 1.4 + 1.4)) / 3.0;
  }

  float getPlasmaY(float x, float horizontalFade, float offset) {
    return random(x * lineFrequency + iTime * lineSpeed) * horizontalFade * lineAmplitude + offset;
  }

  void main() {
    vec2 fragCoord = gl_FragCoord.xy;
    vec2 uv = fragCoord.xy / iResolution.xy;
    vec2 space = (fragCoord - iResolution.xy / 2.0) / iResolution.x * 2.0 * scale;

    float horizontalFade = 1.0 - (cos(uv.x * 6.28) * 0.5 + 0.5);
    float verticalFade = 1.0 - (cos(uv.y * 6.28) * 0.5 + 0.5);

    space.y += random(space.x * warpFrequency + iTime * warpSpeed) * warpAmplitude * (0.5 + horizontalFade);
    space.x += random(space.y * warpFrequency + iTime * warpSpeed + 2.0) * warpAmplitude * horizontalFade;

    vec4 lines = vec4(0.0);

    for (int l = 0; l < linesPerGroup; l++) {
      float normalizedLineIndex = float(l) / float(linesPerGroup);
      float offsetTime = iTime * offsetSpeed;
      float offsetPosition = float(l) + space.x * offsetFrequency;
      float rand = random(offsetPosition + offsetTime) * 0.5 + 0.5;
      float halfWidth = mix(minLineWidth, maxLineWidth, rand * horizontalFade) / 2.0;
      float offset = random(offsetPosition + offsetTime * (1.0 + normalizedLineIndex)) * mix(minOffsetSpread, maxOffsetSpread, horizontalFade);
      float linePosition = getPlasmaY(space.x, horizontalFade, offset);
      float line = drawSmoothLine(linePosition, halfWidth, space.y) / 2.0 + drawCrispLine(linePosition, halfWidth * 0.15, space.y);

      float circleX = mod(float(l) + iTime * lineSpeed, 25.0) - 12.0;
      vec2 circlePosition = vec2(circleX, getPlasmaY(circleX, horizontalFade, offset));
      float circle = drawCircle(circlePosition, 0.01, space) * 4.0;

      line = line + circle;

      // Shade each line by its index so the field carries several hues at once
      // rather than one flat colour.
      vec3 hue = normalizedLineIndex < 0.5
        ? mix(uLineA, uLineB, normalizedLineIndex * 2.0)
        : mix(uLineB, uLineC, (normalizedLineIndex - 0.5) * 2.0);

      lines += line * vec4(hue, 1.0) * rand * uIntensity;
    }

    vec4 fragColor = mix(vec4(uBg1, 1.0), vec4(uBg2, 1.0), uv.x);
    fragColor *= verticalFade;
    fragColor.a = 1.0;
    fragColor += lines;

    gl_FragColor = fragColor;
  }
`;

function loadShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error('[shader-background] compile failed:', gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function initShaderProgram(gl, vs, fs) {
  const vertexShader = loadShader(gl, gl.VERTEX_SHADER, vs);
  const fragmentShader = loadShader(gl, gl.FRAGMENT_SHADER, fs);
  if (!vertexShader || !fragmentShader) return null;

  const program = gl.createProgram();
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  // The shaders are attached to the program, which keeps them alive; deleting
  // the handles here stops them leaking once the program goes.
  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error('[shader-background] link failed:', gl.getProgramInfoLog(program));
    return null;
  }
  return program;
}

export default function ShaderBackground({
  lineColors = [C3.purple, C3.pink, C3.blue],
  backgroundFrom = C3.inkDeep,
  backgroundTo = C3.inkPurple,
  intensity = 1,
  speed = 1,
  className = 'fixed inset-0 w-full h-full -z-10',
}) {
  const canvasRef = useRef(null);
  const frameRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    const gl = canvas.getContext('webgl', { alpha: false, antialias: false });
    if (!gl) {
      console.warn('[shader-background] WebGL not supported; leaving the canvas blank.');
      return undefined;
    }

    const program = initShaderProgram(gl, vsSource, fsSource);
    if (!program) return undefined;

    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);

    const loc = {
      vertexPosition: gl.getAttribLocation(program, 'aVertexPosition'),
      resolution: gl.getUniformLocation(program, 'iResolution'),
      time: gl.getUniformLocation(program, 'iTime'),
      lineA: gl.getUniformLocation(program, 'uLineA'),
      lineB: gl.getUniformLocation(program, 'uLineB'),
      lineC: gl.getUniformLocation(program, 'uLineC'),
      bg1: gl.getUniformLocation(program, 'uBg1'),
      bg2: gl.getUniformLocation(program, 'uBg2'),
      intensity: gl.getUniformLocation(program, 'uIntensity'),
    };

    // Full-screen shader: one pixel per CSS pixel is plenty, and skipping the
    // device pixel ratio keeps the fragment cost sane on a 3x phone screen.
    function resizeCanvas() {
      const width = canvas.clientWidth || window.innerWidth;
      const height = canvas.clientHeight || window.innerHeight;
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
        gl.viewport(0, 0, width, height);
      }
    }
    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();

    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const start = Date.now();
    let running = true;

    function draw() {
      // Frozen but still drawn, so a visitor who has asked for reduced motion
      // gets the artwork without the movement rather than a black rectangle.
      const elapsed = reduceMotion ? 8 : ((Date.now() - start) / 1000) * speed;

      resizeCanvas();
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(program);

      gl.uniform2f(loc.resolution, canvas.width, canvas.height);
      gl.uniform1f(loc.time, elapsed);
      gl.uniform3fv(loc.lineA, lineColors[0]);
      gl.uniform3fv(loc.lineB, lineColors[1] || lineColors[0]);
      gl.uniform3fv(loc.lineC, lineColors[2] || lineColors[0]);
      gl.uniform3fv(loc.bg1, backgroundFrom);
      gl.uniform3fv(loc.bg2, backgroundTo);
      gl.uniform1f(loc.intensity, intensity);

      gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
      gl.vertexAttribPointer(loc.vertexPosition, 2, gl.FLOAT, false, 0, 0);
      gl.enableVertexAttribArray(loc.vertexPosition);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    function frame() {
      if (!running) return;
      draw();
      // A frozen field only needs painting once, and on resize.
      if (!reduceMotion) frameRef.current = requestAnimationFrame(frame);
    }

    // Nothing to render into a tab nobody is looking at.
    function onVisibility() {
      if (document.hidden) {
        running = false;
        if (frameRef.current) cancelAnimationFrame(frameRef.current);
      } else if (!running) {
        running = true;
        frameRef.current = requestAnimationFrame(frame);
      }
    }
    document.addEventListener('visibilitychange', onVisibility);

    frameRef.current = requestAnimationFrame(frame);

    return () => {
      // The reference implementation only removed the resize listener, so its
      // requestAnimationFrame loop kept running after unmount -- a leak that
      // compounds every time the component mounts again.
      running = false;
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      window.removeEventListener('resize', resizeCanvas);
      document.removeEventListener('visibilitychange', onVisibility);
      gl.deleteBuffer(positionBuffer);
      gl.deleteProgram(program);
      // Browsers cap how many live WebGL contexts a page may hold, and reclaim
      // them lazily, so give this one back explicitly.
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    };
  }, [lineColors, backgroundFrom, backgroundTo, intensity, speed]);

  return <canvas ref={canvasRef} aria-hidden="true" className={className} />;
}

export { C3 as SHADER_PALETTE };
