/**
 * Szczegółowe kwiaty: każdy płatek, pąk i liść to osobny, wygięty kawałek geometrii.
 * Atrybut aPetal mówi, które części przyjmują kolor instancji (płatki), a które zostają zielone (łodyga, liście).
 */
import { BufferGeometry, Color, DoubleSide, Float32BufferAttribute, IcosahedronGeometry, CylinderGeometry, MeshLambertMaterial } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { shared } from './fx'

const C = (h: string) => new Color(h)

/** Ujednolica część: bez indeksów, z normalnymi, kolorem i maską płatka */
function part(g: BufferGeometry, color: Color, petal: number, shade?: Float32Array) {
  const ng = g.index ? g.toNonIndexed() : g
  for (const k of Object.keys(ng.attributes)) if (k !== 'position') ng.deleteAttribute(k)
  ng.computeVertexNormals()
  const n = ng.attributes.position.count
  const col = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) {
    const f = shade ? shade[i] : 1
    col[i * 3] = color.r * f
    col[i * 3 + 1] = color.g * f
    col[i * 3 + 2] = color.b * f
  }
  ng.setAttribute('color', new Float32BufferAttribute(col, 3))
  ng.setAttribute('aPetal', new Float32BufferAttribute(new Float32Array(n).fill(petal), 1))
  return ng
}

/**
 * Płatek lub liść: siatka wzdłuż osi X, zaokrąglony kształt, wygięty ku górze (cup)
 * i lekko wklęsły w poprzek. Środek (żyłka) jest jaśniejszy, nasada ciemniejsza.
 */
function blade(len: number, wid: number, cup: number, opts: { segs?: number; across?: number; point?: number } = {}) {
  const segs = opts.segs ?? 4
  const across = opts.across ?? 0.45
  const point = opts.point ?? 0.75
  const pos: number[] = []
  const shade: number[] = []
  for (let i = 0; i <= segs; i++) {
    const u = i / segs
    const w = wid * Math.pow(Math.sin(Math.PI * Math.min(1, 0.06 + u * 0.94)), point)
    const y0 = cup * len * u * u
    for (let j = -1; j <= 1; j++) {
      pos.push(u * len, y0 + Math.abs(j) * w * across, j * w)
      shade.push((j === 0 ? 1 : 0.84) * (0.78 + 0.22 * u))
    }
  }
  const idx: number[] = []
  for (let i = 0; i < segs; i++)
    for (let j = 0; j < 2; j++) {
      const a = i * 3 + j
      idx.push(a, a + 3, a + 1, a + 1, a + 3, a + 4)
    }
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(pos, 3))
  g.setIndex(idx)
  // cieniowanie per wierzchołek po rozwinięciu indeksów
  const flat = new Float32Array(idx.length)
  idx.forEach((v, k) => (flat[k] = shade[v]))
  return { g, shade: flat }
}

/** Okółek płatków wokół osi Y */
function ring(n: number, len: number, wid: number, cup: number, tilt: number, y: number, color: Color, petal: number, offset = 0, opts?: Parameters<typeof blade>[3]) {
  const out: BufferGeometry[] = []
  for (let k = 0; k < n; k++) {
    const { g, shade } = blade(len, wid, cup, opts)
    const geo = part(g, color, petal, shade)
    geo.rotateZ(tilt + (k % 2 ? 0.06 : -0.04))
    geo.rotateY(offset + (k / n) * Math.PI * 2 + (k % 3) * 0.05)
    geo.translate(0, y, 0)
    out.push(geo)
  }
  return out
}

const GREEN = C('#4c7a2c')
const LEAF = C('#5d8f34')
const WHITE = C('#ffffff')

function stem(h: number, r = 0.0055) {
  const g = new CylinderGeometry(r * 0.8, r, h, 5, 2)
  g.translate(0, h / 2, 0)
  return part(g, GREEN, 0)
}

function leaves(specs: [y: number, angle: number, len: number, wid: number][]) {
  return specs.map(([y, ang, len, wid]) => {
    const { g, shade } = blade(len, wid, 0.35, { segs: 5, across: 0.3, point: 0.6 })
    const geo = part(g, LEAF, 0, shade)
    geo.rotateZ(0.75)
    geo.rotateY(ang)
    geo.translate(0, y, 0)
    return geo
  })
}

/** Stokrotka / kosmos: wieniec płaskich płatków i żółty środek */
export function daisy() {
  const head = 0.5
  const center = part(new IcosahedronGeometry(0.024, 1), C('#e8a91f'), 0)
  center.scale(1, 0.55, 1)
  center.translate(0, head + 0.006, 0)
  return mergeGeometries([
    stem(head),
    center,
    ...ring(11, 0.075, 0.016, 0.25, 0.14, head, WHITE, 1),
    ...ring(7, 0.055, 0.014, 0.4, 0.3, head + 0.004, WHITE, 1, 0.3),
    ...leaves([
      [0.12, 0.4, 0.13, 0.024],
      [0.24, 2.6, 0.11, 0.022],
    ]),
  ])
}

/** Tulipan: kielich z sześciu wygiętych płatków i dwa długie liście u nasady */
export function tulip() {
  const head = 0.42
  return mergeGeometries([
    stem(head, 0.0065),
    ...ring(3, 0.062, 0.03, 1.1, 1.05, head, WHITE, 1, 0, { across: 0.6 }),
    ...ring(3, 0.066, 0.032, 1.0, 0.95, head - 0.004, WHITE, 1, Math.PI / 3, { across: 0.6 }),
    ...leaves([
      [0.02, 0.2, 0.22, 0.04],
      [0.04, 3.3, 0.2, 0.038],
    ]),
  ])
}

/** Pąk: zamknięte płatki i zielone działki kielicha */
export function bud() {
  const head = 0.38
  return mergeGeometries([
    stem(head),
    ...ring(5, 0.05, 0.02, 0.5, 1.32, head, WHITE, 1, 0, { across: 0.7 }),
    ...ring(4, 0.03, 0.012, 0.3, 0.85, head - 0.003, GREEN, 0, 0.4),
    ...leaves([[0.15, 1.2, 0.11, 0.02]]),
  ])
}

/** Róża (rozmiar jednostkowy): trzy okółki zwijających się płatków wokół zwartego środka */
export function rose() {
  const center = part(new IcosahedronGeometry(0.2, 1), WHITE, 1)
  center.scale(1, 1.2, 1)
  return mergeGeometries([
    center,
    ...ring(4, 0.42, 0.3, 1.2, 1.3, 0, WHITE, 1, 0, { across: 0.7 }),
    ...ring(5, 0.65, 0.42, 0.95, 0.95, -0.05, WHITE, 1, 0.5, { across: 0.6 }),
    ...ring(6, 0.9, 0.5, 0.75, 0.5, -0.12, WHITE, 1, 0.2, { across: 0.5 }),
  ])
}

/** Liść róży: trzy listki na ogonku (kolor z instancji) */
export function roseLeaf() {
  const parts = [-0.55, 0, 0.55].map((a, i) => {
    const { g, shade } = blade(i === 1 ? 0.6 : 0.48, 0.17, 0.12, { segs: 5, across: 0.25, point: 0.55 })
    const geo = part(g, WHITE, 1, shade)
    geo.rotateY(a)
    geo.translate(i === 1 ? 0.15 : 0.05, 0, 0)
    return geo
  })
  return mergeGeometries(parts)
}

/** Kwiat lotosu na liściu lilii: dwa okółki szpiczastych, różowych płatków */
export function lotus() {
  const center = part(new IcosahedronGeometry(0.16, 1), C('#f2c94c'), 0)
  center.scale(1, 0.6, 1)
  return mergeGeometries([
    center,
    ...ring(8, 0.85, 0.28, 0.55, 0.45, 0, WHITE, 1, 0, { point: 1.2 }),
    ...ring(6, 0.7, 0.24, 0.8, 1.0, 0.05, WHITE, 1, 0.4, { point: 1.2 }),
  ])
}

/**
 * Materiał kwiatów: kolor instancji tylko na płatkach (aPetal = 1),
 * łodyga i liście zachowują własną zieleń; całość kołysze się na wietrze.
 */
export function flowerMaterial(amp: number, glow = '#2a2622') {
  // lekka emisja = płatki „prześwitują” w słońcu i nie gasną po stronie cienia
  const mat = new MeshLambertMaterial({ vertexColors: true, side: DoubleSide, emissive: glow })
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = shared.uTime
    sh.vertexShader =
      'uniform float uTime;\nattribute float aPetal;\n' +
      sh.vertexShader
        .replace(
          '#include <color_vertex>',
          `vColor = vec4(1.0);
          vColor.rgb *= color;
          #ifdef USE_INSTANCING_COLOR
            vColor.rgb = mix(vColor.rgb, vColor.rgb * instanceColor.rgb, aPetal);
          #endif`,
        )
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          #ifdef USE_INSTANCING
            vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
            float wv = sin(uTime * 1.7 + ip.x * 0.4 + ip.z * 0.3) + 0.35 * sin(uTime * 3.3 + ip.z * 1.3);
            float bend = position.y * position.y;
            transformed.x += wv * ${amp.toFixed(3)} * bend;
            transformed.z += wv * ${(amp * 0.45).toFixed(3)} * bend;
          #endif`,
        )
  }
  return mat
}
