/**
 * Drzewa, krzewy i kamienie w wyższej szczegółowości:
 * korony z setek gałązek z liśćmi, świerki z warstwowymi gałęziami,
 * krzewy (także kwitnące), naturalne głazy z porostami, płaskie płyty i otoczaki.
 */
import { BufferGeometry, Color, CylinderGeometry, Float32BufferAttribute, IcosahedronGeometry, Quaternion, Vector3 } from 'three'
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { blade, part } from './flowers'
import { noise } from './shape'

const C = (h: string) => new Color(h)
const UP = new Vector3(0, 1, 0)

function rng(seed: number) {
  let s = seed
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646
}

const n3 = (x: number, y: number, z: number) => (noise(x + 3.1, y - 1.7) + noise(y + 7.3, z + 2.9) + noise(z - 5.2, x + 4.4)) / 3

/** Gładka (nie fasetkowa) bryła z szumem — baza dla koron, głazów i otoczaków */
function smoothBlob(r: number, detail: number, amp: number, freq: number, seed: number) {
  let g: BufferGeometry = new IcosahedronGeometry(r, detail)
  g.deleteAttribute('normal')
  g.deleteAttribute('uv')
  g = mergeVertices(g)
  const p = g.attributes.position
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i)
    const y = p.getY(i)
    const z = p.getZ(i)
    const k = 1 + amp * n3(x * freq + seed, y * freq, z * freq - seed)
    p.setXYZ(i, x * k, y * k, z * k)
  }
  g.computeVertexNormals()
  return g
}

function colorize(g: BufferGeometry, fn: (x: number, y: number, z: number, ny: number) => Color) {
  const p = g.attributes.position
  const n = g.attributes.normal
  const c = new Float32Array(p.count * 3)
  for (let i = 0; i < p.count; i++) {
    const col = fn(p.getX(i), p.getY(i), p.getZ(i), n.getY(i))
    c.set([col.r, col.g, col.b], i * 3)
  }
  g.setAttribute('color', new Float32BufferAttribute(c, 3))
  return g
}

/** Gałązka: trzy liście rozłożone wachlarzem, z jaśniejszą żyłką */
function sprig(len: number, color: Color) {
  return [-0.55, 0, 0.55].map((a, i) => {
    const { g, shade } = blade(len * (i === 1 ? 1 : 0.82), len * 0.32, 0.25, { segs: 2, across: 0.35, point: 0.65 })
    const geo = part(g, color, 0, shade)
    geo.rotateY(a)
    return geo
  })
}

type Blob = [x: number, y: number, z: number, r: number]

/**
 * Korona z liści: ciemne wnętrze (żeby nie było prześwitów) + gałązki rozsiane po powierzchni,
 * jaśniejsze od strony nieba. Kolor całości pochodzi z instancji (różne odcienie zieleni).
 */
function leafyCrown(blobs: Blob[], sprigs: number, leafLen: number, seed: number, upBias = 0.35) {
  const r = rng(seed)
  const parts: BufferGeometry[] = []
  blobs.forEach(([x, y, z, rad], i) => {
    const inner = part(smoothBlob(rad * 0.7, 1, 0.2, 1.4, seed + i), C('#ffffff').multiplyScalar(0.36), 0)
    inner.translate(x, y, z)
    parts.push(inner)
  })
  const weights = blobs.map((b) => b[3] * b[3])
  const total = weights.reduce((a, b) => a + b, 0)
  const q = new Quaternion()
  const tw = new Quaternion()
  const dir = new Vector3()
  for (let i = 0; i < sprigs; i++) {
    let pick = r() * total
    let bi = 0
    while (pick > weights[bi] && bi < blobs.length - 1) pick -= weights[bi++]
    const [bx, by, bz, rad] = blobs[bi]
    dir.set(r() * 2 - 1, r() * 2 - 1 + upBias, r() * 2 - 1).normalize()
    const light = 0.72 + 0.3 * Math.max(0, dir.y) + r() * 0.12
    const leafCol = C('#ffffff').multiplyScalar(light)
    q.setFromUnitVectors(UP, dir)
    tw.setFromAxisAngle(dir, r() * Math.PI * 2)
    const d = rad * (0.88 + r() * 0.2)
    for (const leaf of sprig(leafLen * (0.85 + r() * 0.3), leafCol)) {
      leaf.applyQuaternion(q)
      leaf.applyQuaternion(tw)
      leaf.translate(bx + dir.x * d, by + dir.y * d, bz + dir.z * d)
      parts.push(leaf)
    }
  }
  return mergeGeometries(parts)
}

/** Drzewo liściaste (korona na pniu o wysokości ~1.5) */
export function leafyTree(hi: boolean) {
  return leafyCrown(
    [
      [0, 1.75, 0, 0.78],
      [0.4, 1.45, 0.15, 0.55],
      [-0.34, 1.5, -0.2, 0.58],
      [0.05, 2.2, -0.05, 0.5],
      [-0.1, 1.55, 0.42, 0.45],
    ],
    hi ? 190 : 80,
    0.2,
    11,
  )
}

/** Topola: wąska, wysoka korona */
export function leafyPoplar(hi: boolean) {
  return leafyCrown(
    [
      [0, 0.35, 0, 0.62],
      [0, 0.95, 0, 0.72],
      [0, 1.55, 0, 0.6],
      [0, 2.05, 0, 0.42],
    ].map(([x, y, z, r]) => [x, y, z, r] as Blob),
    hi ? 170 : 75,
    0.17,
    23,
    0.1,
  )
}

/** Świerk: kolejne piętra opadających gałęzi */
export function spruce(hi: boolean) {
  const parts: BufferGeometry[] = []
  const tiers = hi ? 7 : 5
  const r = rng(5)
  for (let t = 0; t < tiers; t++) {
    const k = t / (tiers - 1)
    const y = 0.55 + k * 1.85
    const len = 0.75 * (1 - k * 0.78) + 0.08
    const n = Math.round(9 - k * 4)
    for (let b = 0; b < n; b++) {
      const { g, shade } = blade(len, len * 0.42, -0.35, { segs: 4, across: -0.2, point: 0.55 })
      const geo = part(g, C('#ffffff').multiplyScalar(0.62 + k * 0.25 + r() * 0.1), 0, shade)
      geo.rotateZ(-0.25 - (1 - k) * 0.25)
      geo.rotateY((b / n) * Math.PI * 2 + t * 0.5 + r() * 0.3)
      geo.translate(0, y, 0)
      parts.push(geo)
    }
  }
  const tip = part(new CylinderGeometry(0.0, 0.06, 0.35, 5), C('#ffffff').multiplyScalar(0.8), 0)
  tip.translate(0, 2.5, 0)
  parts.push(tip)
  return mergeGeometries(parts)
}

/** Krzew; wersja kwitnąca ma kuliste baldachy kwiatów (kolor z instancji, aPetal = 1) */
export function shrub(hi: boolean, flowering: boolean) {
  const crown = leafyCrown(
    [
      [0, 0.42, 0, 0.48],
      [0.34, 0.33, 0.12, 0.36],
      [-0.3, 0.36, -0.14, 0.38],
      [0.05, 0.62, -0.08, 0.3],
    ],
    hi ? 60 : 32,
    0.13,
    flowering ? 41 : 37,
    0.5,
  )
  if (!flowering) return crown
  // barwa liści stała (zielona), kwiaty przyjmują kolor instancji
  const leaves = crown.clone()
  const lc = leaves.attributes.color
  for (let i = 0; i < lc.count; i++) lc.setXYZ(i, lc.getX(i) * 0.34, lc.getY(i) * 0.56, lc.getZ(i) * 0.24)
  leaves.setAttribute('aPetal', new Float32BufferAttribute(new Float32Array(lc.count), 1))
  const r = rng(77)
  const blooms: BufferGeometry[] = [leaves]
  for (let i = 0; i < (hi ? 16 : 10); i++) {
    const dir = new Vector3(r() * 2 - 1, r() * 0.9 + 0.2, r() * 2 - 1).normalize()
    const ball = part(smoothBlob(0.085, 1, 0.25, 9, i), C('#ffffff').multiplyScalar(0.85 + r() * 0.15), 1)
    ball.translate(dir.x * 0.5, 0.4 + dir.y * 0.45, dir.z * 0.5)
    blooms.push(ball)
  }
  return mergeGeometries(blooms)
}

/** Uproszczony krzew do oglądania z daleka (zielony, bez kwiatów) */
export function shrubLod() {
  const g = part(smoothBlob(0.56, 1, 0.22, 2, 5), C('#ffffff').multiplyScalar(0.7), 0)
  g.scale(1.15, 0.85, 1.15)
  g.translate(0, 0.42, 0)
  return g
}

/** Głaz: gładki, z warstwami skały, porostami i mchem tylko na szczycie */
export function boulder() {
  const g = smoothBlob(1, 4, 0.3, 1.1, 3)
  const p = g.attributes.position
  for (let i = 0; i < p.count; i++) {
    // drobniejsze nierówności i krawędzie, żeby kamień nie był „poduszką”
    const x0 = p.getX(i)
    const y0 = p.getY(i)
    const z0 = p.getZ(i)
    const k = 1 + 0.12 * n3(x0 * 2.7, y0 * 2.7, z0 * 2.7) + 0.09 * Math.abs(n3(x0 * 5.5, y0 * 5.5, z0 * 5.5)) - 0.03
    p.setXYZ(i, x0 * k, y0 * k, z0 * k)
    let y = p.getY(i) * 0.66
    if (y < -0.22) y = -0.22 + (y + 0.22) * 0.25
    p.setY(i, y)
  }
  g.computeVertexNormals()
  const grey = C('#8a877b')
  const dark = C('#5e5c54')
  const lichen = C('#c9bf86')
  const pale = C('#d8d5c6')
  const moss = C('#6b8a33')
  return colorize(g, (x, y, z, ny) => {
    const base = grey.clone().lerp(dark, 0.5 + 0.5 * n3(x * 2.2, y * 2.2, z * 2.2))
    base.multiplyScalar(0.92 + 0.08 * Math.sin(y * 22 + n3(x * 3, y, z * 3) * 4)) // warstwy skały
    const l = n3(x * 7, y * 7, z * 7)
    if (l > 0.32) base.lerp(lichen, Math.min(1, (l - 0.32) * 4) * 0.8)
    else if (l < -0.38) base.lerp(pale, 0.5)
    // mech tylko w zagłębieniach na samym wierzchu
    const m = Math.max(0, (ny - 0.78) / 0.2 + n3(x * 4, y * 4, z * 4) * 1.2 - 0.3)
    return base.lerp(moss, Math.min(0.6, m))
  })
}

/** Płaska płyta kamienna (do przejścia przez staw) o nieregularnym obrysie */
export function flagstone() {
  let g: BufferGeometry = new CylinderGeometry(1, 0.92, 0.28, 28, 2)
  g.deleteAttribute('normal')
  g.deleteAttribute('uv')
  g = mergeVertices(g)
  const p = g.attributes.position
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i)
    const y = p.getY(i)
    const z = p.getZ(i)
    const a = Math.atan2(z, x)
    const rim = 1 + 0.16 * noise(Math.cos(a) * 1.6 + 4, Math.sin(a) * 1.6) + 0.05 * noise(Math.cos(a) * 5, Math.sin(a) * 5)
    const top = y > 0.1 ? 0.03 * noise(x * 3, z * 3) : 0
    p.setXYZ(i, x * rim, y + top, z * rim)
  }
  g.computeVertexNormals()
  return colorize(g, (x, y, z, ny) =>
    C('#b4ad9c').multiplyScalar(0.82 + 0.12 * ny + 0.08 * noise(x * 6, z * 6 + y)).lerp(C('#c9c18f'), Math.max(0, noise(x * 9, z * 9)) * 0.35),
  )
}

/** Otoczak: mały, wygładzony kamień (kolor z instancji) */
export function pebble() {
  const g = smoothBlob(1, 2, 0.18, 1.3, 9)
  g.scale(1, 0.55, 0.8)
  g.computeVertexNormals()
  return colorize(g, (_x, _y, _z, ny) => C('#ffffff').multiplyScalar(0.8 + 0.2 * ny))
}

/** Bukszpan strzyżony: gęsta, drobno „pikselowana” powierzchnia */
export function clippedBox() {
  const g = smoothBlob(1, 3, 0.06, 6, 2)
  const p = g.attributes.position
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i)
    const y = p.getY(i)
    const z = p.getZ(i)
    const k = 1 + 0.035 * n3(x * 14, y * 14, z * 14)
    p.setXYZ(i, x * k, y * k, z * k)
  }
  g.computeVertexNormals()
  return colorize(g, (x, y, z, ny) => C('#ffffff').multiplyScalar(0.72 + 0.22 * ny + 0.1 * n3(x * 18, y * 18, z * 18)))
}
