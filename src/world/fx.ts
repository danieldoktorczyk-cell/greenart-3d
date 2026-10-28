/** Shadery: niebo, trawa na wietrze, woda, pyłki/świetliki i poświata lampionów. */
import {
  AdditiveBlending,
  BackSide,
  BufferAttribute,
  BufferGeometry,
  CircleGeometry,
  Color,
  DataTexture,
  Float32BufferAttribute,
  HalfFloatType,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  LinearFilter,
  Mesh,
  Points,
  RGBAFormat,
  ShaderMaterial,
  SphereGeometry,
  UniformsLib,
  UniformsUtils,
  Vector2,
  Vector3,
  ClampToEdgeWrapping,
  DoubleSide,
} from 'three'
import { WORLD } from './shape'

export const shared = {
  uTime: { value: 0 },
}

const fogPars = UniformsLib.fog

// ——— Niebo ———
export function createSky() {
  const mat = new ShaderMaterial({
    side: BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uTop: { value: new Color() },
      uHorizon: { value: new Color() },
      uSun: { value: new Color() },
      uSunDir: { value: new Vector3(0, 0.3, -1) },
      uTime: shared.uTime,
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = p.xyww;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uTop; uniform vec3 uHorizon; uniform vec3 uSun; uniform vec3 uSunDir; uniform float uTime;
      varying vec3 vDir;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
      float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
        return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y); }
      void main() {
        vec3 d = normalize(vDir);
        float y = d.y;
        // błękit zaczyna się już nisko nad horyzontem — pogodne niebo zamiast szarej mgły
        vec3 col = mix(uHorizon, uTop, pow(smoothstep(-0.03, 0.42, y), 0.75));
        // miękkie, wolno płynące chmury
        vec2 cp = d.xz / max(y + 0.25, 0.08) * 1.4 + vec2(uTime * 0.004, 0.0);
        float c = vnoise(cp) * 0.6 + vnoise(cp * 2.7) * 0.3 + vnoise(cp * 6.1) * 0.1;
        // białe, puszyste chmury pogodnego dnia, od spodu lekko zacienione
        float cl = smoothstep(0.6, 0.88, c) * smoothstep(0.03, 0.3, y);
        vec3 cloud = mix(vec3(0.82, 0.86, 0.92), vec3(1.0), smoothstep(0.55, 0.95, c));
        col = mix(col, cloud * mix(vec3(1.0), uSun, 0.25), cl * 0.85);
        float sd = max(dot(d, normalize(uSunDir)), 0.0);
        col += uSun * (pow(sd, 1400.0) * 9.0 + pow(sd, 40.0) * 0.45 + pow(sd, 5.0) * 0.18);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  })
  const mesh = new Mesh(new SphereGeometry(800, 32, 16), mat)
  mesh.frustumCulled = false
  mesh.renderOrder = -1
  return { mesh, mat }
}

// ——— Mapa wysokości jako tekstura (dla trawy) ———
export function heightTexture(data: Uint16Array, w: number, h: number) {
  const t = new DataTexture(data, w, h, RGBAFormat, HalfFloatType)
  t.magFilter = LinearFilter
  t.minFilter = LinearFilter
  t.wrapS = t.wrapT = ClampToEdgeWrapping
  t.needsUpdate = true
  return t
}

// ——— Trawa: stała łatka źdźbeł, która „zawija się” wokół kamery ———
export function createGrass(tex: DataTexture, count: number, size: number, shadows = false) {
  const g = new InstancedBufferGeometry()
  // źdźbło: 4 segmenty zwężające się ku górze
  const seg = 4
  const pos: number[] = []
  const idx: number[] = []
  for (let i = 0; i <= seg; i++) {
    const y = i / seg
    const w = 0.5 * Math.pow(1 - y, 0.85)
    if (i < seg) pos.push(-w, y, 0, w, y, 0)
    else pos.push(0, 1, 0)
  }
  for (let i = 0; i < seg - 1; i++) {
    const a = i * 2
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
  }
  const last = (seg - 1) * 2
  idx.push(last, last + 1, last + 2)
  g.setAttribute('position', new Float32BufferAttribute(pos, 3))
  g.setIndex(idx)

  const off = new Float32Array(count * 2)
  const rnd = new Float32Array(count * 4)
  let s = 7
  const r = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646
  for (let i = 0; i < count; i++) {
    off[i * 2] = (r() - 0.5) * size
    off[i * 2 + 1] = (r() - 0.5) * size
    rnd[i * 4] = 0.28 + Math.pow(r(), 1.8) * 0.62 // wysokość
    rnd[i * 4 + 1] = 0.035 + r() * 0.04 // szerokość
    rnd[i * 4 + 2] = r() // obrót
    rnd[i * 4 + 3] = r() // odcień
  }
  g.setAttribute('aOffset', new InstancedBufferAttribute(off, 2))
  g.setAttribute('aRand', new InstancedBufferAttribute(rnd, 4))
  g.instanceCount = count

  const mat = new ShaderMaterial({
    fog: true,
    lights: true,
    side: DoubleSide,
    uniforms: UniformsUtils.merge([
      fogPars,
      UniformsLib.lights,
      {
        uCam: { value: new Vector2() },
        uSize: { value: size },
        uHeight: { value: null },
        uWMin: { value: new Vector2(WORLD.xMin, WORLD.zMin) },
        uWSize: { value: new Vector2(WORLD.xMax - WORLD.xMin, WORLD.zMax - WORLD.zMin) },
        uTime: { value: 0 },
        uBase: { value: new Color('#2b4720') },
        uTip: { value: new Color('#a9bd58') },
        uDry: { value: new Color('#c9b766') },
        uLight: { value: new Color(1, 1, 1) },
        uSun: { value: new Color(1, 1, 1) },
      },
    ]),
    vertexShader: /* glsl */ `
      #include <common>
      #include <fog_pars_vertex>
      #include <shadowmap_pars_vertex>
      attribute vec2 aOffset; attribute vec4 aRand;
      uniform vec2 uCam; uniform float uSize; uniform sampler2D uHeight; uniform vec2 uWMin; uniform vec2 uWSize; uniform float uTime;
      varying float vY; varying float vVar; varying float vWave; varying float vPatch;
      float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
      void main() {
        vec2 rel = mod(aOffset - uCam + uSize * 0.5, uSize) - uSize * 0.5;
        vec2 w = uCam + rel;
        vec4 tx = texture2D(uHeight, (w - uWMin) / uWSize);
        float fade = 1.0 - smoothstep(uSize * 0.28, uSize * 0.5, length(rel));
        // kępy: miejscami trawa wyższa i bujniejsza, miejscami niższa i przesuszona
        float patchN = vn(w * 0.12) * 0.65 + vn(w * 0.45) * 0.35;
        float hgt = aRand.x * tx.g * fade * (0.6 + patchN * 0.85);
        float ang = aRand.z * 6.2831853;
        vec3 p = position;
        p.x *= aRand.y;
        float c = cos(ang), s = sin(ang);
        vec3 bp = vec3(p.x * c, p.y * hgt, p.x * s);
        float t = uTime * 1.5;
        float wave = sin(w.x * 0.32 + t) * 0.5 + sin(w.y * 0.23 + t * 1.27) * 0.5 + sin((w.x + w.y) * 1.1 + t * 2.6) * 0.18;
        float bend = p.y * p.y;
        bp.x += (wave * 0.3 + 0.14) * bend * hgt;
        bp.z += wave * 0.12 * bend * hgt;
        vec4 worldPosition = vec4(vec3(w.x, tx.r - 0.04, w.y) + bp, 1.0);
        vec4 mvPosition = viewMatrix * worldPosition;
        gl_Position = projectionMatrix * mvPosition;
        vY = p.y; vVar = aRand.w; vWave = wave; vPatch = patchN;
        #include <shadowmap_vertex>
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      uniform bool receiveShadow;
      #include <common>
      #include <packing>
      #include <fog_pars_fragment>
      #include <shadowmap_pars_fragment>
      #include <shadowmask_pars_fragment>
      uniform vec3 uBase; uniform vec3 uTip; uniform vec3 uDry; uniform vec3 uLight; uniform vec3 uSun;
      varying float vY; varying float vVar; varying float vWave; varying float vPatch;
      void main() {
        vec3 tip = mix(uTip, uDry, smoothstep(0.55, 0.15, vPatch) * 0.55);
        vec3 col = mix(uBase, tip, smoothstep(0.0, 1.0, vY)) * (0.8 + vVar * 0.38);
        col *= mix(0.45, 1.0, vY);
        col *= uLight;
        // cień drzew i pergoli kładzie się także na trawie
        float sh = getShadowMask();
        col *= mix(0.58, 1.0, sh);
        col += uSun * 0.08 * vY * (vWave * 0.5 + 0.5) * sh;
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  })
  mat.uniforms.uHeight.value = tex
  mat.uniforms.uTime = shared.uTime
  const mesh = new Mesh(g, mat)
  mesh.frustumCulled = false
  mesh.receiveShadow = shadows
  return { mesh, mat }
}

// ——— Woda ———
export function createWater(rx: number, rz: number, y: number, x: number, z: number) {
  const geo = new CircleGeometry(1, 64)
  geo.rotateX(-Math.PI / 2)
  geo.scale(rx, 1, rz)
  const mat = new ShaderMaterial({
    fog: true,
    transparent: true,
    uniforms: UniformsUtils.merge([
      fogPars,
      {
        uTop: { value: new Color() },
        uHorizon: { value: new Color() },
        uSun: { value: new Color() },
        uSunDir: { value: new Vector3() },
        uTime: { value: 0 },
      },
    ]),
    vertexShader: /* glsl */ `
      #include <fog_pars_vertex>
      varying vec3 vW;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vW = wp.xyz;
        vec4 mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <fog_pars_fragment>
      uniform vec3 uTop; uniform vec3 uHorizon; uniform vec3 uSun; uniform vec3 uSunDir; uniform float uTime;
      varying vec3 vW;
      void main() {
        float t = uTime;
        vec2 p = vW.xz;
        vec3 n = normalize(vec3(
          sin(p.x * 1.7 + t * 1.1) * 0.03 + sin(p.y * 2.9 - t * 1.6) * 0.02 + sin((p.x + p.y) * 6.0 + t * 2.2) * 0.012,
          1.0,
          cos(p.y * 1.3 + t * 0.9) * 0.03 + sin(p.x * 3.3 + t * 1.4) * 0.02));
        vec3 v = normalize(cameraPosition - vW);
        float fres = pow(1.0 - max(dot(n, v), 0.0), 3.0);
        vec3 r = reflect(-v, n);
        vec3 sky = mix(uHorizon, uTop, clamp(r.y * 1.6, 0.0, 1.0));
        vec3 deep = vec3(0.035, 0.07, 0.055);
        vec3 col = mix(deep, sky, 0.18 + 0.82 * fres);
        col += uSun * pow(max(dot(r, normalize(uSunDir)), 0.0), 220.0) * 3.0;
        gl_FragColor = vec4(col, 0.94);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  })
  mat.uniforms.uTime = shared.uTime
  const mesh = new Mesh(geo, mat)
  mesh.position.set(x, y, z)
  return { mesh, mat }
}

// ——— Pyłki i świetliki wokół kamery ———
export function createMotes(count: number, box: number) {
  const g = new BufferGeometry()
  const p = new Float32Array(count * 3)
  const r = new Float32Array(count)
  for (let i = 0; i < count; i++) {
    p[i * 3] = (Math.random() - 0.5) * box
    p[i * 3 + 1] = Math.random() * 12
    p[i * 3 + 2] = (Math.random() - 0.5) * box
    r[i] = Math.random()
  }
  g.setAttribute('position', new BufferAttribute(p, 3))
  g.setAttribute('aR', new BufferAttribute(r, 1))
  const mat = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    uniforms: {
      uTime: shared.uTime,
      uCam: { value: new Vector3() },
      uBox: { value: box },
      uGlow: { value: 0.3 },
      uColor: { value: new Color('#fff2c8') },
      uPx: { value: 1 },
    },
    vertexShader: /* glsl */ `
      attribute float aR;
      uniform float uTime; uniform vec3 uCam; uniform float uBox; uniform float uPx;
      varying float vA;
      void main() {
        vec3 p = position;
        p.x += sin(uTime * 0.3 + aR * 40.0) * 1.5;
        p.y += sin(uTime * 0.5 + aR * 17.0) * 0.8 + mod(uTime * 0.15 * aR, 4.0);
        p.z += cos(uTime * 0.25 + aR * 23.0) * 1.5;
        vec3 rel = mod(p - uCam + uBox * 0.5, uBox) - uBox * 0.5;
        rel.y = mod(p.y, 12.0) - 2.0;
        vec4 mv = viewMatrix * vec4(uCam + rel, 1.0);
        gl_Position = projectionMatrix * mv;
        float d = -mv.z;
        gl_PointSize = uPx * (2.0 + aR * 3.5) * (22.0 / max(d, 1.0));
        vA = (0.5 + 0.5 * sin(uTime * (1.0 + aR * 2.0) + aR * 50.0)) * (1.0 - smoothstep(uBox * 0.3, uBox * 0.5, length(rel.xz)));
      }`,
    fragmentShader: /* glsl */ `
      uniform float uGlow; uniform vec3 uColor;
      varying float vA;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.0, d);
        gl_FragColor = vec4(uColor * a * vA * uGlow, 1.0);
      }`,
  })
  const pts = new Points(g, mat)
  pts.frustumCulled = false
  return { points: pts, mat }
}

/** Poświata (np. lampionów) w podanych miejscach */
export function createGlows(positions: Float32Array, size: number, color: string) {
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(positions, 3))
  const mat = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    uniforms: { uSize: { value: size }, uGlow: { value: 1 }, uColor: { value: new Color(color) }, uTime: shared.uTime, uPx: { value: 1 } },
    vertexShader: /* glsl */ `
      uniform float uSize; uniform float uTime; uniform float uPx;
      varying float vF;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        vF = 0.85 + 0.15 * sin(uTime * 3.0 + position.z);
        gl_PointSize = uPx * uSize * (300.0 / max(-mv.z, 1.0));
      }`,
    fragmentShader: /* glsl */ `
      uniform float uGlow; uniform vec3 uColor;
      varying float vF;
      void main() {
        float d = length(gl_PointCoord - 0.5) * 2.0;
        float a = pow(max(1.0 - d, 0.0), 2.4);
        gl_FragColor = vec4(uColor * a * uGlow * vF, 1.0);
      }`,
  })
  const pts = new Points(g, mat)
  pts.frustumCulled = false
  return { points: pts, mat }
}
