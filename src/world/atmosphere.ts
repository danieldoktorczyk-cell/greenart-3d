/** Pora dnia i nastrój zmieniają się wraz z drogą: od porannej mgły do zachodu słońca. */
import { Color, Vector3 } from 'three'

type Key = {
  z: number
  top: string
  horizon: string
  fog: string
  density: number
  sun: string
  sunEl: number
  sunAz: number
  hemiSky: string
  hemiGround: string
  sunI: number
  hemiI: number
  grassTip: string
  glow: number
}

const KEYS: Key[] = [
  // brama — poranna, zielono-złota mgła
  { z: 30, top: '#9fbfae', horizon: '#eef0cf', fog: '#dfe4c2', density: 0.0092, sun: '#fff1cf', sunEl: 14, sunAz: 8, hemiSky: '#f3f2d6', hemiGround: '#4c5a2c', sunI: 2.4, hemiI: 1.25, grassTip: '#b6c463', glow: 0.35 },
  // łąka — jasny dzień
  { z: -170, top: '#86b2cb', horizon: '#e8efdc', fog: '#d8e4d6', density: 0.0068, sun: '#fff6e2', sunEl: 34, sunAz: 20, hemiSky: '#eaf2f4', hemiGround: '#4d5d2e', sunI: 2.8, hemiI: 1.15, grassTip: '#a9bd58', glow: 0.25 },
  // parter — czyste południe
  { z: -380, top: '#6f9fc4', horizon: '#dfeae6', fog: '#d3e1df', density: 0.0052, sun: '#ffffff', sunEl: 55, sunAz: 35, hemiSky: '#e7f0f6', hemiGround: '#53632f', sunI: 3.0, hemiI: 1.1, grassTip: '#a5bd55', glow: 0.2 },
  // staw — zamglona, chłodna cisza
  { z: -600, top: '#87a5a3', horizon: '#cbd9cf', fog: '#c3d3c9', density: 0.0145, sun: '#eef6ee', sunEl: 26, sunAz: -30, hemiSky: '#dbe8e2', hemiGround: '#3b4a33', sunI: 1.7, hemiI: 1.35, grassTip: '#93ab5c', glow: 0.55 },
  // kwiaty — ciepłe popołudnie
  { z: -800, top: '#97b3c9', horizon: '#f3e2c4', fog: '#ecdcc0', density: 0.0072, sun: '#ffe2b0', sunEl: 18, sunAz: -15, hemiSky: '#f6ead6', hemiGround: '#5c5a2e', sunI: 2.7, hemiI: 1.1, grassTip: '#c2bf5c', glow: 0.4 },
  // pergola — złota godzina
  { z: -990, top: '#5d6b8a', horizon: '#f4b98e', fog: '#e9ad88', density: 0.0105, sun: '#ffb46e', sunEl: 6, sunAz: -5, hemiSky: '#f6c9a6', hemiGround: '#4a3a2c', sunI: 2.2, hemiI: 0.95, grassTip: '#c79b54', glow: 1 },
  // polana — zmierzch
  { z: -1080, top: '#2f3756', horizon: '#e79a7a', fog: '#c98a77', density: 0.0095, sun: '#ff9a62', sunEl: 2.5, sunAz: 0, hemiSky: '#c99a8e', hemiGround: '#2f2a26', sunI: 1.5, hemiI: 0.8, grassTip: '#a77f4f', glow: 1.3 },
]

export type Atmo = {
  top: Color
  horizon: Color
  fog: Color
  density: number
  sun: Color
  sunDir: Vector3
  hemiSky: Color
  hemiGround: Color
  sunI: number
  hemiI: number
  grassTip: Color
  glow: number
}

const parsed = KEYS.map((k) => ({
  ...k,
  c: {
    top: new Color(k.top),
    horizon: new Color(k.horizon),
    fog: new Color(k.fog),
    sun: new Color(k.sun),
    hemiSky: new Color(k.hemiSky),
    hemiGround: new Color(k.hemiGround),
    grassTip: new Color(k.grassTip),
  },
}))

const out: Atmo = {
  top: new Color(),
  horizon: new Color(),
  fog: new Color(),
  density: 0,
  sun: new Color(),
  sunDir: new Vector3(),
  hemiSky: new Color(),
  hemiGround: new Color(),
  sunI: 0,
  hemiI: 0,
  grassTip: new Color(),
  glow: 0,
}

export function atmosphereAt(z: number): Atmo {
  let i = 0
  while (i < parsed.length - 2 && z < parsed[i + 1].z) i++
  const a = parsed[i]
  const b = parsed[i + 1]
  let t = (a.z - z) / (a.z - b.z)
  t = Math.min(1, Math.max(0, t))
  t = t * t * (3 - 2 * t)
  for (const k of ['top', 'horizon', 'fog', 'sun', 'hemiSky', 'hemiGround', 'grassTip'] as const) out[k].copy(a.c[k]).lerp(b.c[k], t)
  const L = (x: number, y: number) => x + (y - x) * t
  out.density = L(a.density, b.density)
  out.sunI = L(a.sunI, b.sunI)
  out.hemiI = L(a.hemiI, b.hemiI)
  out.glow = L(a.glow, b.glow)
  const el = (L(a.sunEl, b.sunEl) * Math.PI) / 180
  const az = (L(a.sunAz, b.sunAz) * Math.PI) / 180
  // słońce zawsze mniej więcej przed nami (kamera patrzy w -z), żeby było pod światło
  out.sunDir.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)).normalize()
  return out
}
