/**
 * Geografia świata: dolina, ścieżka i pięć ogrodów.
 * Te same funkcje liczą teren w Web Workerze i ustawiają kamerę w głównym wątku.
 * Oś Z biegnie "w głąb" — kamera startuje przy z = 30 i idzie w stronę z = -1060.
 */

// ——— Szum simplex 2D (deterministyczny) ———
const perm = new Uint8Array(512)
{
  let s = 1337
  const r = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646
  const p = Array.from({ length: 256 }, (_, i) => i)
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(r() * (i + 1))
    ;[p[i], p[j]] = [p[j], p[i]]
  }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255]
}
const G = [1, 1, -1, 1, 1, -1, -1, -1, 1, 0, -1, 0, 0, 1, 0, -1]
const F2 = 0.5 * (Math.sqrt(3) - 1)
const G2 = (3 - Math.sqrt(3)) / 6

export function noise(x: number, y: number) {
  const s = (x + y) * F2
  const i = Math.floor(x + s)
  const j = Math.floor(y + s)
  const t = (i + j) * G2
  const x0 = x - (i - t)
  const y0 = y - (j - t)
  const i1 = x0 > y0 ? 1 : 0
  const j1 = 1 - i1
  const x1 = x0 - i1 + G2
  const y1 = y0 - j1 + G2
  const x2 = x0 - 1 + 2 * G2
  const y2 = y0 - 1 + 2 * G2
  const ii = i & 255
  const jj = j & 255
  let n = 0
  const c = (gx: number, gy: number, g: number) => {
    let tt = 0.5 - gx * gx - gy * gy
    if (tt < 0) return 0
    tt *= tt
    const k = (g % 8) * 2
    return tt * tt * (G[k] * gx + G[k + 1] * gy)
  }
  n += c(x0, y0, perm[ii + perm[jj]])
  n += c(x1, y1, perm[ii + i1 + perm[jj + j1]])
  n += c(x2, y2, perm[ii + 1 + perm[jj + 1]])
  return 70 * n
}

export function fbm(x: number, y: number, oct = 4) {
  let a = 0.5
  let f = 1
  let v = 0
  for (let o = 0; o < oct; o++) {
    v += a * noise(x * f, y * f)
    f *= 2.03
    a *= 0.5
  }
  return v
}

export const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}
export const mix = (a: number, b: number, t: number) => a + (b - a) * t

// ——— Świat ———
export const WORLD = { xMin: -240, xMax: 240, zMin: -1240, zMax: 90 }
export const Z_START = 30
export const Z_END = -1060

export const pathX = (z: number) => 14 * Math.sin(z * 0.0065) + 6 * Math.sin(z * 0.019 + 1.3)
export const pathY = (z: number) => 1.5 * Math.sin(z * 0.012) + 0.8 * Math.sin(z * 0.031)

/** Ogród francuski (parter bukszpanowy) */
export const PARTERRE = { x: pathX(-380), z: -380, r: 46 }
/** Staw z kamieniami do przejścia */
export const POND = { x: pathX(-600), z: -600, rx: 26, rz: 34 }
export const WATER_LEVEL = pathY(-600) - 0.35
/** Pole kwiatów */
export const FLOWERS = { z0: -700, z1: -915 }
/** Lawendowa łąka */
export const MEADOW = { z0: -80, z1: -285 }
/** Pergola z różami */
export const PERGOLA = { z0: -945, z1: -1035 }
/** Polana z logo na końcu */
export const FINALE = { x: pathX(-1110), z: -1110, r: 44 }

export const pondE = (x: number, z: number) => Math.hypot((x - POND.x) / POND.rx, (z - POND.z) / POND.rz)

/** Wysokość terenu w punkcie (x, z) */
export function heightAt(x: number, z: number) {
  const px = pathX(z)
  const d = Math.abs(x - px)
  const n1 = fbm(x * 0.004, z * 0.004)
  const n2 = fbm(x * 0.016 + 7, z * 0.016 - 3, 3)
  const hills = (n1 * 0.5 + 0.5) * 34 + n2 * 4.5
  const valley = smoothstep(9, 85, d)
  let h = pathY(z) + valley * hills + smoothstep(70, 220, d) * 38 + n2 * 0.35 * (1 - valley)

  // płaski parter
  const dp = Math.hypot(x - PARTERRE.x, z - PARTERRE.z)
  h = mix(h, pathY(PARTERRE.z), 1 - smoothstep(PARTERRE.r + 4, PARTERRE.r + 34, dp))

  // polana na końcu
  const df = Math.hypot(x - FINALE.x, z - FINALE.z)
  h = mix(h, pathY(FINALE.z) + 0.3, 1 - smoothstep(FINALE.r - 10, FINALE.r + 25, df))

  // staw: najpierw spłaszczenie brzegu, potem niecka
  const e = pondE(x, z)
  if (e < 2.4) {
    h = mix(h, WATER_LEVEL + 0.45, 1 - smoothstep(1.25, 2.3, e))
    const bed = WATER_LEVEL - 0.25 - 1.7 * (1 - Math.min(e, 1))
    h = mix(bed, h, smoothstep(0.82, 1.18, e))
  }
  return h
}

/** Gęstość trawy 0..1 (0 = ścieżka, żwir, woda) */
export function grassAt(x: number, z: number) {
  const d = Math.abs(x - pathX(z))
  const u = x - PARTERRE.x
  const v = z - PARTERRE.z
  const r = Math.hypot(u, v)
  if (r < PARTERRE.r + 2) {
    // żwirowe alejki parteru, między nimi trawniki
    if (Math.abs(u) < 2.6 || Math.abs(v) < 2.6) return 0
    if (r < 8.5 || (r > 16 && r < 20) || r > PARTERRE.r - 2) return 0
    return 1
  }
  if (pondE(x, z) < 1.04) return 0
  const path = smoothstep(1.3, 2.5, d)
  const inFlowers = z < FLOWERS.z0 && z > FLOWERS.z1 ? 0.55 : 1
  return path * inFlowers
}

/** Czy punkt leży na żwirze parteru */
export function gravelAt(x: number, z: number) {
  const r = Math.hypot(x - PARTERRE.x, z - PARTERRE.z)
  return r < PARTERRE.r + 2 && grassAt(x, z) === 0
}

// ——— Lot kamery: klatki kluczowe wzdłuż ścieżki ———
// h — wysokość kamery nad ścieżką, ahead — jak daleko patrzy, lookH — wysokość punktu, na który patrzy
export type CamKey = { z: number; h: number; ahead: number; lookH: number }
export const CAM_KEYS: CamKey[] = [
  { z: 30, h: 2.3, ahead: 26, lookH: 3.1 },
  { z: -40, h: 2.1, ahead: 20, lookH: 1.8 },
  { z: -170, h: 3.4, ahead: 24, lookH: 0.9 },
  { z: -290, h: 6, ahead: 28, lookH: 1 },
  { z: -380, h: 44, ahead: 24, lookH: -4 },
  { z: -460, h: 7, ahead: 26, lookH: 1.5 },
  { z: -555, h: 2.4, ahead: 20, lookH: 1.2 },
  { z: -600, h: 1.25, ahead: 18, lookH: 0.8 },
  { z: -680, h: 2.8, ahead: 22, lookH: 1.6 },
  { z: -800, h: 5, ahead: 24, lookH: 0.2 },
  { z: -925, h: 2.1, ahead: 18, lookH: 2 },
  { z: -990, h: 1.9, ahead: 16, lookH: 2.3 },
  { z: -1060, h: 3.4, ahead: 44, lookH: 10.5 },
]

export function camKeyAt(z: number): CamKey {
  const k = CAM_KEYS
  if (z >= k[0].z) return k[0]
  for (let i = 0; i < k.length - 1; i++) {
    const a = k[i]
    const b = k[i + 1]
    if (z <= a.z && z >= b.z) {
      const t = (a.z - z) / (a.z - b.z)
      const s = t * t * (3 - 2 * t)
      return { z, h: mix(a.h, b.h, s), ahead: mix(a.ahead, b.ahead, s), lookH: mix(a.lookH, b.lookH, s) }
    }
  }
  return k[k.length - 1]
}
