/** Proceduralne geometrie roślin i obiektów (low-poly, z kolorami wierzchołków). */
import {
  BoxGeometry,
  BufferGeometry,
  CircleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Float32BufferAttribute,
  IcosahedronGeometry,
  OctahedronGeometry,
  SphereGeometry,
} from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { noise } from './shape'

/** Nadaje kolor wszystkim wierzchołkom (funkcja może zależeć od pozycji i normalnej). */
function paint(g: BufferGeometry, fn: (x: number, y: number, z: number, ny: number) => Color) {
  const p = g.attributes.position
  const n = g.attributes.normal
  const c = new Float32Array(p.count * 3)
  for (let i = 0; i < p.count; i++) {
    const col = fn(p.getX(i), p.getY(i), p.getZ(i), n ? n.getY(i) : 1)
    c[i * 3] = col.r
    c[i * 3 + 1] = col.g
    c[i * 3 + 2] = col.b
  }
  g.setAttribute('color', new Float32BufferAttribute(c, 3))
  return g
}

/** Zniekształca bryłę szumem, żeby wyglądała organicznie; zwraca wersję z fasetkami. */
function lumpy(g: BufferGeometry, amp: number, freq: number, seed = 0) {
  const ng = g.index ? g.toNonIndexed() : g
  const p = ng.attributes.position
  // te same wierzchołki muszą przesunąć się tak samo (inaczej powstałyby dziury)
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i)
    const y = p.getY(i)
    const z = p.getZ(i)
    const k = 1 + amp * noise(x * freq + seed, z * freq + y * freq * 0.7 - seed)
    p.setXYZ(i, x * k, y * k, z * k)
  }
  ng.computeVertexNormals()
  return ng
}

const C = (h: string) => new Color(h)

export function treeCanopy() {
  const parts = [
    [0, 1.75, 0, 0.78],
    [0.38, 1.45, 0.15, 0.55],
    [-0.32, 1.5, -0.2, 0.58],
    [0.05, 2.15, -0.05, 0.5],
  ].map(([x, y, z, r], i) => {
    const g = lumpy(new IcosahedronGeometry(r, 1), 0.18, 1.6, i * 3.1)
    g.translate(x, y, z)
    return g
  })
  const g = mergeGeometries(parts)
  return paint(g, (_x, y, _z, ny) => C('#ffffff').multiplyScalar(0.62 + 0.25 * Math.min(1, (y - 1) / 1.4) + 0.16 * ny))
}

export function trunk() {
  const g = new CylinderGeometry(0.06, 0.11, 1.5, 6)
  g.translate(0, 0.75, 0)
  return g
}

export function conifer() {
  const parts = [
    [0.62, 1.1, 0.75],
    [0.48, 1.0, 1.35],
    [0.33, 0.9, 1.9],
    [0.18, 0.7, 2.35],
  ].map(([r, h, y], i) => {
    const g = lumpy(new ConeGeometry(r, h, 7, 1), 0.08, 2, i)
    g.translate(0, y, 0)
    return g
  })
  return paint(mergeGeometries(parts), (_x, y, _z, ny) => C('#ffffff').multiplyScalar(0.6 + 0.12 * y + 0.12 * ny))
}

export function poplar() {
  const g = lumpy(new IcosahedronGeometry(1, 2), 0.12, 1.8, 4)
  g.translate(0, 1.05, 0)
  return paint(g, (_x, y, _z, ny) => C('#ffffff').multiplyScalar(0.62 + 0.15 * y + 0.15 * ny))
}

export function rock() {
  const g = lumpy(new IcosahedronGeometry(1, 2), 0.28, 0.9, 7)
  const grey = C('#7b7a6d')
  const moss = C('#5f7a2c')
  const mossLight = C('#9aab4a')
  return paint(g, (x, y, z, ny) => {
    const m = Math.min(1, Math.max(0, (ny - 0.15) / 0.55 + noise(x * 3, z * 3 + y) * 0.25))
    return grey.clone().lerp(moss, m).lerp(mossLight, Math.max(0, m - 0.7) * 1.5)
  })
}

/** Płaskie, szare kamienie do przejścia przez staw */
export function stone() {
  const g = lumpy(new IcosahedronGeometry(1, 2), 0.2, 0.9, 11)
  return paint(g, (x, y, z, ny) => C('#a9a497').multiplyScalar(0.85 + 0.15 * ny + noise(x * 4, z * 4 + y) * 0.05))
}

/** Lawenda: kępa wąskich, srebrzystych liści i kłosy złożone z drobnych kwiatków */
export function lavender() {
  const parts: BufferGeometry[] = []
  let seed = 3
  const r = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646
  const leafCol = C('#7f9472')
  for (let i = 0; i < 16; i++) {
    const leaf = new ConeGeometry(0.018, 0.34, 3, 1)
    leaf.translate(0, 0.17, 0)
    leaf.rotateZ(0.25 + r() * 0.55)
    leaf.rotateY(r() * Math.PI * 2)
    parts.push(paint(leaf.toNonIndexed(), () => leafCol.clone().multiplyScalar(0.85 + r() * 0.3)))
  }
  for (let i = 0; i < 13; i++) {
    const a = r() * Math.PI * 2
    const tilt = 0.1 + r() * 0.32
    const h = 0.5 + r() * 0.2
    const stem = new CylinderGeometry(0.006, 0.008, h, 3)
    stem.translate(0, h / 2, 0)
    const spike: BufferGeometry[] = [paint(stem.toNonIndexed(), () => C('#7c8c5e'))]
    // kłos: kilka okółków drobnych kwiatków, coraz mniejszych ku górze
    for (let k = 0; k < 6; k++) {
      const f = new OctahedronGeometry(0.03 * (1 - k * 0.1), 0)
      f.scale(1, 1.5, 1)
      f.translate(0, h - 0.02 + k * 0.045, 0)
      const shade = 0.75 + k * 0.06
      spike.push(paint(f.toNonIndexed(), () => C('#7b5fc0').lerp(C('#b9a0e3'), k / 6).multiplyScalar(shade + r() * 0.1)))
    }
    const g = mergeGeometries(spike.map((s) => { s.deleteAttribute('uv'); return s }))
    g.rotateZ(tilt)
    g.rotateY(a)
    parts.push(g)
  }
  return mergeGeometries(parts.map((s) => { if (s.attributes.uv) s.deleteAttribute('uv'); return s }))
}

export function boxwood() {
  const g = lumpy(new IcosahedronGeometry(1, 2), 0.07, 2.5, 9)
  return paint(g, (_x, _y, _z, ny) => C('#ffffff').multiplyScalar(0.75 + 0.25 * ny))
}

export function topiaryCone() {
  const g = lumpy(new ConeGeometry(1, 1, 12, 3), 0.05, 3, 1)
  g.translate(0, 0.5, 0)
  return paint(g, (_x, y) => C('#2b4a22').multiplyScalar(0.8 + 0.4 * y))
}

export function flowerHead() {
  return new IcosahedronGeometry(1, 0)
}

export function blossom() {
  return lumpy(new IcosahedronGeometry(1, 1), 0.12, 3, 5)
}

export function lilyPad() {
  const g = new CircleGeometry(1, 16, 0.35, Math.PI * 2 - 0.7)
  g.rotateX(-Math.PI / 2)
  return g
}

export function wood() {
  return new BoxGeometry(1, 1, 1)
}

export function lantern() {
  return new SphereGeometry(1, 12, 8)
}

/** Fontanna w środku parteru: misa, kolumna i czasza */
export function fountain() {
  const basin = new CylinderGeometry(6.2, 6.5, 0.7, 48, 1, true)
  basin.translate(0, 0.35, 0)
  const rim = new CylinderGeometry(6.5, 6.5, 0.2, 48)
  rim.translate(0, 0.72, 0)
  const water = new CylinderGeometry(6.15, 6.15, 0.05, 48)
  water.translate(0, 0.55, 0)
  const col = new CylinderGeometry(0.45, 0.6, 2.6, 16)
  col.translate(0, 1.3, 0)
  const bowl = new CylinderGeometry(1.9, 0.5, 0.5, 24)
  bowl.translate(0, 2.7, 0)
  const top = new CylinderGeometry(0.15, 0.25, 1, 12)
  top.translate(0, 3.3, 0)
  const stone = C('#e6dccb')
  const parts = [basin, rim, col, bowl, top].map((g) => paint(g.toNonIndexed(), () => stone))
  parts.push(paint(water.toNonIndexed(), () => C('#7fa7a8')))
  return mergeGeometries(parts)
}
