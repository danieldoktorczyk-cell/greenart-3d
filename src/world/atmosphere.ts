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
  // brama — słoneczny poranek, lekka złocista mgiełka nad trawą
  { z: 30, top: '#4f97d8', horizon: '#e3edf2', fog: '#dce8ee', density: 0.0022, sun: '#fff0cc', sunEl: 20, sunAz: 10, hemiSky: '#f6f3dc', hemiGround: '#55652f', sunI: 3.0, hemiI: 1.2, grassTip: '#bccb5e', glow: 0.25 },
  // łąka — bezchmurny, jasny dzień
  { z: -170, top: '#4f97d8', horizon: '#e6f0f4', fog: '#dbe8ef', density: 0.003, sun: '#fff8e8', sunEl: 40, sunAz: 22, hemiSky: '#eef6fb', hemiGround: '#56682f', sunI: 3.3, hemiI: 1.1, grassTip: '#b2c85a', glow: 0.15 },
  // parter — słoneczne południe
  { z: -380, top: '#3f8ad4', horizon: '#e2eef6', fog: '#d8e7f1', density: 0.0026, sun: '#ffffff', sunEl: 58, sunAz: 35, hemiSky: '#ecf4fb', hemiGround: '#5a6c31', sunI: 3.4, hemiI: 1.05, grassTip: '#acc457', glow: 0.12 },
  // staw — rześkie, słoneczne przedpołudnie z błękitem w wodzie
  { z: -600, top: '#4a93d6', horizon: '#e4f0f2', fog: '#d9e8ec', density: 0.0034, sun: '#fffaf0', sunEl: 34, sunAz: -25, hemiSky: '#eaf4f6', hemiGround: '#4f6234', sunI: 3.1, hemiI: 1.15, grassTip: '#a8c35c', glow: 0.2 },
  // kwiaty — ciepłe, słoneczne popołudnie
  { z: -800, top: '#5b9bd4', horizon: '#f6ead2', fog: '#efe6d4', density: 0.0032, sun: '#ffe7bd', sunEl: 24, sunAz: -15, hemiSky: '#f8eedc', hemiGround: '#62652f', sunI: 3.2, hemiI: 1.05, grassTip: '#c4c45c', glow: 0.3 },
  // pergola — złota godzina
  { z: -990, top: '#6b86b8', horizon: '#f8c79a', fog: '#f1c7a2', density: 0.0045, sun: '#ffbe78', sunEl: 8, sunAz: -5, hemiSky: '#f8d6b4', hemiGround: '#55432e', sunI: 2.7, hemiI: 1.0, grassTip: '#cfa75a', glow: 0.9 },
  // polana — ciepły zachód słońca
  { z: -1080, top: '#4f68a0', horizon: '#f4ad82', fog: '#e9ad8c', density: 0.0048, sun: '#ffa868', sunEl: 4, sunAz: 0, hemiSky: '#e9b49a', hemiGround: '#3f3429', sunI: 2.1, hemiI: 0.9, grassTip: '#bf9152', glow: 1.15 },
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
