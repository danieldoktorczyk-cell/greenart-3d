/**
 * Życie w ogrodzie: motyle, ważki i opadające płatki.
 * Wszystko liczone na karcie graficznej — każdy owad ma własne ziarno losowe i tor lotu.
 */
import {
  Color,
  DoubleSide,
  Float32BufferAttribute,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Mesh,
  ShaderMaterial,
  UniformsLib,
  UniformsUtils,
  Vector3,
} from 'three'
import { shared } from './fx'

const common = /* glsl */ `
  uniform float uTime; uniform vec3 uCam; uniform float uBox; uniform float uGround;
  attribute vec4 aSeed; attribute vec3 aColor;
  varying vec3 vColor; varying float vShade;
  mat3 rotY(float a){ float c=cos(a), s=sin(a); return mat3(c,0.,-s, 0.,1.,0., s,0.,c); }
  mat3 rotX(float a){ float c=cos(a), s=sin(a); return mat3(1.,0.,0., 0.,c,s, 0.,-s,c); }
  mat3 rotZ(float a){ float c=cos(a), s=sin(a); return mat3(c,s,0., -s,c,0., 0.,0.,1.); }
  // pozycja "zawija się" wokół kamery, więc owady są zawsze w pobliżu
  vec3 wrap(vec3 p){ vec3 r = p; r.xz = mod(p.xz - uCam.xz + uBox * 0.5, uBox) - uBox * 0.5; return vec3(uCam.x + r.x, p.y, uCam.z + r.z); }
`

function mat(vertexBody: string, opts: { opacity?: number } = {}) {
  return new ShaderMaterial({
    fog: true,
    side: DoubleSide,
    transparent: true,
    depthWrite: false,
    uniforms: UniformsUtils.merge([
      UniformsLib.fog,
      { uCam: { value: new Vector3() }, uGround: { value: 0 }, uBox: { value: 60 }, uLight: { value: new Color(1, 1, 1) }, uOpacity: { value: opts.opacity ?? 1 } },
    ]),
    vertexShader: /* glsl */ `
      #include <fog_pars_vertex>
      ${common}
      void main() {
        ${vertexBody}
        vec4 mvPosition = viewMatrix * vec4(world, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        vColor = aColor;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <fog_pars_fragment>
      uniform vec3 uLight; uniform float uOpacity;
      varying vec3 vColor; varying float vShade;
      void main() {
        vec3 col = vColor * uLight * (0.75 + 0.35 * vShade);
        gl_FragColor = vec4(col, uOpacity);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  })
}

function instanced(pos: number[], count: number, seedFn: (i: number) => number[], colorFn: (i: number) => Color) {
  const g = new InstancedBufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(pos, 3))
  const seed = new Float32Array(count * 4)
  const col = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) {
    seed.set(seedFn(i), i * 4)
    const c = colorFn(i)
    col.set([c.r, c.g, c.b], i * 3)
  }
  g.setAttribute('aSeed', new InstancedBufferAttribute(seed, 4))
  g.setAttribute('aColor', new InstancedBufferAttribute(col, 3))
  g.instanceCount = count
  return g
}

const rand = (() => {
  let s = 4242
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646
})()
const pick = (arr: string[]) => new Color(arr[Math.floor(rand() * arr.length)])

/** Motyle: dwa skrzydła (każde z dwóch płatów) machające wokół tułowia */
export function butterflies(count: number) {
  // skrzydło w płaszczyźnie XZ, x > 0 = prawe; lewe dostaje x < 0
  const wing = (s: number) => [
    0, 0, 0, s * 0.9, 0, -0.55, s * 1.0, 0, 0.15,
    0, 0, 0, s * 1.0, 0, 0.15, s * 0.55, 0, 0.6,
  ]
  const body = [-0.05, 0, -0.35, 0.05, 0, -0.35, 0, 0, 0.45]
  const pos = [...wing(1), ...wing(-1), ...body]
  const g = instanced(
    pos,
    count,
    () => [rand() * 200 - 100, rand() * 200 - 100, rand(), rand()],
    () => pick(['#ffffff', '#f7d84a', '#f08a24', '#5f9be8', '#e86f9a', '#f2a541', '#fff4dc']),
  )
  const m = mat(/* glsl */ `
    float t = uTime * (0.35 + aSeed.w * 0.25) + aSeed.z * 50.0;
    // tor lotu: krzywe Lissajous + delikatne podskoki
    vec3 c = vec3(aSeed.x + sin(t * 0.7) * 4.0 + sin(t * 1.9) * 1.2,
                  0.7 + aSeed.z * 2.2 + sin(t * 2.3) * 0.35 + sin(t * 5.1) * 0.12,
                  aSeed.y + cos(t * 0.5) * 4.0 + sin(t * 1.3) * 1.5);
    vec3 vel = vec3(0.7 * 4.0 * cos(t * 0.7) + 1.9 * 1.2 * cos(t * 1.9), 0.0, -0.5 * 4.0 * sin(t * 0.5) + 1.3 * 1.5 * cos(t * 1.3));
    float heading = atan(vel.x, vel.z);
    float flap = sin(uTime * (11.0 + aSeed.w * 6.0) + aSeed.z * 20.0) * 1.05 + 0.2;
    vec3 p = position;
    float side = sign(p.x);
    // skrzydło obraca się wokół osi tułowia (Z)
    if (abs(p.x) > 0.001) p = rotZ(side * flap) * p;
    vShade = abs(p.y) > 0.0 ? 1.0 : 0.6;
    p *= 0.24 + aSeed.w * 0.12;
    vec3 world = wrap(c) + rotY(heading) * p;
    world.y += uGround;
  `)
  m.uniforms.uTime = shared.uTime
  m.uniforms.uBox.value = 46
  const mesh = new Mesh(g, m)
  mesh.frustumCulled = false
  return { mesh, mat: m }
}

/** Ważki: długi tułów i cztery wąskie, migoczące skrzydła; latają nad stawem */
export function dragonflies(count: number, center: Vector3, radius: number) {
  const wing = (x: number, z: number) => [0, 0, z, x, 0, z - 0.06, x * 0.95, 0, z + 0.08]
  const body = [-0.03, 0, -0.6, 0.03, 0, -0.6, 0, 0.02, 0.45]
  const pos = [...wing(0.55, 0.12), ...wing(-0.55, 0.12), ...wing(0.5, -0.05), ...wing(-0.5, -0.05), ...body]
  const g = instanced(
    pos,
    count,
    () => [rand() * Math.PI * 2, rand() * radius, rand(), rand()],
    () => pick(['#2f8fa3', '#3a6fd1', '#4fb39a', '#b2463c']),
  )
  const m = mat(/* glsl */ `
    float t = uTime * 0.6 + aSeed.z * 40.0;
    // zawisanie w miejscu i nagłe przeskoki
    float hop = floor(t * 0.5);
    float f = fract(t * 0.5);
    float k = smoothstep(0.75, 0.95, f);
    float a0 = aSeed.x + hop * 1.7, a1 = aSeed.x + (hop + 1.0) * 1.7;
    float r0 = mod(aSeed.y + hop * 3.1, ${radius.toFixed(1)}), r1 = mod(aSeed.y + (hop + 1.0) * 3.1, ${radius.toFixed(1)});
    vec2 p0 = vec2(cos(a0), sin(a0)) * r0, p1 = vec2(cos(a1), sin(a1)) * r1;
    vec2 xz = mix(p0, p1, k) + vec2(sin(uTime * 3.0 + aSeed.z * 9.0), cos(uTime * 2.6 + aSeed.w * 9.0)) * 0.05;
    vec3 c = vec3(${center.x.toFixed(2)} + xz.x, ${(center.y + 0.6).toFixed(2)} + aSeed.w * 0.8 + sin(uTime * 2.0 + aSeed.z * 7.0) * 0.08, ${center.z.toFixed(2)} + xz.y);
    vec2 dir = p1 - p0;
    float heading = atan(dir.x, dir.y);
    vec3 p = position;
    float flap = sin(uTime * 55.0 + aSeed.z * 30.0) * 0.35;
    if (abs(p.x) > 0.05) p = rotZ(sign(p.x) * flap) * p;
    vShade = abs(p.x) > 0.05 ? 1.2 : 0.7;
    p *= 0.5 + aSeed.w * 0.2;
    vec3 world = c + rotY(heading) * p;
  `, { opacity: 0.9 })
  m.uniforms.uTime = shared.uTime
  const mesh = new Mesh(g, m)
  mesh.frustumCulled = false
  return { mesh, mat: m }
}

/** Płatki: opadają, wirują i znoszone są przez wiatr; wszędzie wokół kamery */
export function petals(count: number) {
  const pos = [0, 0, -0.5, 0.35, 0, 0, 0, 0, 0.5, 0, 0, -0.5, 0, 0, 0.5, -0.35, 0, 0]
  const g = instanced(
    pos,
    count,
    () => [rand() * 200 - 100, rand() * 200 - 100, rand(), rand()],
    () => pick(['#f6d3dc', '#fbe9ee', '#f1b7c3', '#fff7ef', '#e98fa0']),
  )
  const m = mat(/* glsl */ `
    float speed = 0.35 + aSeed.w * 0.4;
    float t = uTime * speed + aSeed.z * 30.0;
    float y = 9.0 - mod(t * 1.2, 9.5);
    vec3 c = vec3(aSeed.x + uTime * 0.6 + sin(t * 1.3) * 1.2, y, aSeed.y + uTime * 0.25 + cos(t * 0.9) * 1.0);
    vec3 p = rotX(t * 3.1) * rotZ(t * 2.3) * rotY(aSeed.z * 6.28) * position;
    vShade = 0.6 + 0.4 * abs(sin(t * 3.1));
    p *= 0.035 + aSeed.w * 0.035;
    vec3 world = wrap(c) + p;
    world.y += uGround;
  `, { opacity: 0.95 })
  m.uniforms.uTime = shared.uTime
  m.uniforms.uBox.value = 40
  const mesh = new Mesh(g, m)
  mesh.frustumCulled = false
  return { mesh, mat: m }
}
