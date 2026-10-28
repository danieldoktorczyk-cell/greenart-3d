/// <reference lib="webworker" />
/**
 * Generator świata — działa w osobnym wątku, żeby nie blokować strony.
 * Zwraca gotowe bufory: teren, mapę wysokości dla trawy i rozmieszczenie wszystkich obiektów.
 */
import { Color, DataUtils, Euler, Matrix4, Quaternion, Vector3 } from 'three'
import {
  FINALE,
  FLOWERS,
  MEADOW,
  PARTERRE,
  PERGOLA,
  POND,
  WATER_LEVEL,
  WORLD,
  fbm,
  grassAt,
  gravelAt,
  heightAt,
  noise,
  pathX,
  pathY,
  pondE,
  smoothstep,
} from './shape'

export type GenOptions = { quality: 'high' | 'low' }
export type Inst = { m: Float32Array; c?: Float32Array }
export type GenResult = {
  terrain: { pos: Float32Array; nor: Float32Array; col: Float32Array; idx: Uint32Array }
  tex: { data: Uint16Array; w: number; h: number }
  inst: Record<string, Inst>
}

let seed = 9
const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646
const R = (a: number, b: number) => a + rnd() * (b - a)

const m4 = new Matrix4()
const q = new Quaternion()
const eul = new Euler()
const pV = new Vector3()
const sV = new Vector3()
const col = new Color()

class Batch {
  m: number[] = []
  c: number[] = []
  add(x: number, y: number, z: number, sx: number, sy: number, sz: number, ry = 0, rx = 0, rz = 0, color?: Color) {
    q.setFromEuler(eul.set(rx, ry, rz))
    m4.compose(pV.set(x, y, z), q, sV.set(sx, sy, sz))
    for (let i = 0; i < 16; i++) this.m.push(m4.elements[i])
    if (color) this.c.push(color.r, color.g, color.b)
  }
  out(): Inst {
    return { m: new Float32Array(this.m), c: this.c.length ? new Float32Array(this.c) : undefined }
  }
}

const hex = (h: string) => new Color(h)
const P = {
  grassDark: hex('#2f4a22'),
  grass: hex('#55772f'),
  grassLight: hex('#8ea24a'),
  hilltop: hex('#a3a957'),
  dirt: hex('#9b8460'),
  gravel: hex('#d9ceb5'),
  pondBed: hex('#24352a'),
  rock: hex('#6f6f62'),
}

function generate(opts: GenOptions): GenResult {
  const hi = opts.quality === 'high'
  // ——— Teren ———
  const sx = hi ? 220 : 130
  const sz = hi ? 620 : 360
  const W = WORLD.xMax - WORLD.xMin
  const D = WORLD.zMax - WORLD.zMin
  const nx = sx + 1
  const nz = sz + 1
  const hs = new Float32Array(nx * nz)
  const pos = new Float32Array(nx * nz * 3)
  for (let j = 0; j < nz; j++) {
    const z = WORLD.zMax - (j / sz) * D
    for (let i = 0; i < nx; i++) {
      const x = WORLD.xMin + (i / sx) * W
      const k = j * nx + i
      const h = heightAt(x, z)
      hs[k] = h
      pos[k * 3] = x
      pos[k * 3 + 1] = h
      pos[k * 3 + 2] = z
    }
  }
  const nor = new Float32Array(nx * nz * 3)
  const colr = new Float32Array(nx * nz * 3)
  const dx = W / sx
  const dz = D / sz
  const c = new Color()
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const k = j * nx + i
      const hl = hs[j * nx + Math.max(0, i - 1)]
      const hr = hs[j * nx + Math.min(sx, i + 1)]
      const hu = hs[Math.max(0, j - 1) * nx + i]
      const hd = hs[Math.min(sz, j + 1) * nx + i]
      const n = new Vector3((hl - hr) / (2 * dx), 1, (hd - hu) / (2 * dz)).normalize()
      nor[k * 3] = n.x
      nor[k * 3 + 1] = n.y
      nor[k * 3 + 2] = n.z

      const x = pos[k * 3]
      const z = pos[k * 3 + 2]
      const h = hs[k]
      const v = fbm(x * 0.03, z * 0.03, 3) * 0.5 + 0.5
      c.copy(P.grassDark).lerp(P.grass, smoothstep(0.15, 0.7, v))
      c.lerp(P.grassLight, smoothstep(0.62, 1, v) * 0.6)
      c.lerp(P.hilltop, smoothstep(18, 55, h - pathY(z)) * 0.55)
      c.lerp(P.rock, smoothstep(0.82, 0.62, n.y) * 0.8)
      const g = grassAt(x, z)
      if (gravelAt(x, z)) c.copy(P.gravel).multiplyScalar(0.9 + noise(x * 0.8, z * 0.8) * 0.06)
      else if (pondE(x, z) < 1.05) c.copy(P.pondBed)
      else if (g < 1 && Math.abs(x - pathX(z)) < 3) c.lerp(P.dirt, 1 - g)
      colr[k * 3] = c.r
      colr[k * 3 + 1] = c.g
      colr[k * 3 + 2] = c.b
    }
  }
  const idx = new Uint32Array(sx * sz * 6)
  let p = 0
  for (let j = 0; j < sz; j++)
    for (let i = 0; i < sx; i++) {
      const a = j * nx + i
      const b = a + 1
      const cc = a + nx
      const d = cc + 1
      idx[p++] = a
      idx[p++] = b
      idx[p++] = cc
      idx[p++] = b
      idx[p++] = d
      idx[p++] = cc
    }

  // ——— Mapa wysokości + maski dla shadera trawy (R = wysokość, G = trawa) ———
  const tw = hi ? 480 : 300
  const th = hi ? 1330 : 830
  const tex = new Uint16Array(tw * th * 4)
  for (let j = 0; j < th; j++) {
    const z = WORLD.zMin + ((j + 0.5) / th) * D
    for (let i = 0; i < tw; i++) {
      const x = WORLD.xMin + ((i + 0.5) / tw) * W
      const k = (j * tw + i) * 4
      tex[k] = DataUtils.toHalfFloat(heightAt(x, z))
      tex[k + 1] = DataUtils.toHalfFloat(grassAt(x, z))
      tex[k + 2] = DataUtils.toHalfFloat(0)
      tex[k + 3] = DataUtils.toHalfFloat(1)
    }
  }

  // ——— Obiekty ———
  const inst: Record<string, Batch> = {}
  const B = (name: string) => (inst[name] ??= new Batch())
  const dParter = (x: number, z: number) => Math.hypot(x - PARTERRE.x, z - PARTERRE.z)
  const dFinale = (x: number, z: number) => Math.hypot(x - FINALE.x, z - FINALE.z)

  // drzewa liściaste i iglaste
  const nTrees = hi ? 900 : 380
  let placed = 0
  for (let a = 0; a < 40000 && placed < nTrees; a++) {
    const z = R(WORLD.zMin + 20, WORLD.zMax - 10)
    const x = R(WORLD.xMin + 10, WORLD.xMax - 10)
    const d = Math.abs(x - pathX(z))
    if (d < 15 || dParter(x, z) < PARTERRE.r + 22 || pondE(x, z) < 2.2) continue
    const df = dFinale(x, z)
    if (df < FINALE.r + 4) continue
    const ring = df < FINALE.r + 26
    if (!ring && fbm(x * 0.012, z * 0.012, 2) * 0.5 + 0.5 < (d < 40 ? 0.5 : 0.4)) continue
    const h = heightAt(x, z)
    const conifer = h - pathY(z) > 16 && rnd() < 0.55
    const s = R(3.2, 7.5) * (d < 30 ? 0.8 : 1)
    col.setHSL(conifer ? R(0.3, 0.38) : R(0.2, 0.3), R(0.35, 0.55), conifer ? R(0.13, 0.2) : R(0.22, 0.36))
    B(conifer ? 'conifer' : 'tree').add(x, h - 0.3, z, s, s * R(0.9, 1.35), s, R(0, 6.28), 0, 0, col)
    placed++
  }
  // klony japońskie przy stawie i na polanie
  for (let a = 0; a < 4000 && (inst.maple?.m.length ?? 0) / 16 < 60; a++) {
    const ang = R(0, Math.PI * 2)
    const e = R(1.35, 2.5)
    const x = POND.x + Math.cos(ang) * POND.rx * e
    const z = POND.z + Math.sin(ang) * POND.rz * e
    if (Math.abs(x - pathX(z)) < 4) continue
    const s = R(2.2, 3.6)
    col.setHSL(R(0.0, 0.06), R(0.65, 0.8), R(0.35, 0.5))
    B('maple').add(x, heightAt(x, z) - 0.2, z, s, s * R(0.8, 1), s, R(0, 6.28), 0, 0, col)
  }
  // aleje topoli
  for (const [z0, z1] of [
    [-255, -305],
    [-452, -540],
  ])
    for (let z = z0; z > z1; z -= 7)
      for (const side of [-1, 1]) {
        const x = pathX(z) + side * 6.5
        col.setHSL(R(0.25, 0.3), 0.45, R(0.2, 0.26))
        B('poplar').add(x, heightAt(x, z) - 0.2, z, R(1.5, 1.8), R(6.5, 8), R(1.5, 1.8), R(0, 6.28), 0, 0, col)
      }

  // omszałe kamienie
  for (let a = 0; a < (hi ? 420 : 200); a++) {
    const z = R(-20, Z_LAST)
    const side = rnd() < 0.5 ? -1 : 1
    const d = 2.8 + Math.pow(rnd(), 2) * 55
    const x = pathX(z) + side * d
    if (dParter(x, z) < PARTERRE.r + 4 || pondE(x, z) < 1.15) continue
    if (z < PERGOLA.z0 + 4 && z > PERGOLA.z1 - 4 && d < 4.5) continue
    const s = 0.3 + Math.pow(rnd(), 3) * 2.6
    B('rock').add(x, heightAt(x, z) - 0.25 * s, z, s * R(0.9, 1.4), s * R(0.55, 0.9), s, R(0, 6.28))
  }
  // kamienie przez staw
  for (let z = POND.z + POND.rz * 1.15; z > POND.z - POND.rz * 1.15; z -= 1.45) {
    const x = pathX(z) + R(-0.3, 0.3)
    if (pondE(x, z) > 1.12) continue
    B('stone').add(x, WATER_LEVEL + 0.06, z, R(0.75, 0.95), R(0.18, 0.24), R(0.6, 0.75), R(0, 6.28))
  }
  // liście lilii wodnych + kwiaty
  for (let a = 0; a < 600 && (inst.lily?.m.length ?? 0) / 16 < 170; a++) {
    const ang = R(0, Math.PI * 2)
    const e = Math.sqrt(rnd()) * 0.92
    const x = POND.x + Math.cos(ang) * POND.rx * e
    const z = POND.z + Math.sin(ang) * POND.rz * e
    if (Math.abs(x - pathX(z)) < 2.3) continue
    const s = R(0.45, 1.05)
    col.setHSL(R(0.24, 0.32), R(0.45, 0.6), R(0.24, 0.34))
    B('lily').add(x, WATER_LEVEL + 0.02, z, s, 1, s, R(0, 6.28), 0, 0, col)
    if (rnd() < 0.22) {
      col.setHSL(R(0.93, 0.99), R(0.5, 0.7), R(0.78, 0.88))
      B('lotus').add(x + 0.15, WATER_LEVEL + 0.08, z, 0.45, 0.45, 0.45, R(0, 6.28), 0, 0, col)
    }
  }

  // lawendowe rzędy
  for (let z = MEADOW.z0; z > MEADOW.z1; z -= hi ? 0.95 : 1.4)
    for (let k = 0; k < (hi ? 10 : 7); k++)
      for (const side of [-1, 1]) {
        if (rnd() < 0.05) continue
        const x = pathX(z) + side * (3.6 + k * 2.5) + R(-0.15, 0.15)
        const s = R(0.75, 1.1)
        B('lavender').add(x, heightAt(x, z) - 0.05, z, s, s * R(0.9, 1.15), s, R(0, 6.28))
      }

  // parter: żywopłoty bukszpanowe wzdłuż granic trawników
  const st = 0.62
  for (let u = -PARTERRE.r; u <= PARTERRE.r; u += st)
    for (let v = -PARTERRE.r; v <= PARTERRE.r; v += st) {
      const x = PARTERRE.x + u
      const z = PARTERRE.z + v
      if (grassAt(x, z) !== 1) continue
      const e = 0.75
      if (grassAt(x + e, z) && grassAt(x - e, z) && grassAt(x, z + e) && grassAt(x, z - e)) continue
      col.setHSL(R(0.27, 0.31), R(0.4, 0.5), R(0.16, 0.21))
      B('box').add(x, pathY(PARTERRE.z) + 0.25, z, 0.46, 0.5, 0.46, R(0, 6.28), 0, 0, col)
    }
  // topiary: kule i stożki
  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 4 + (k * Math.PI) / 2
    const y0 = pathY(PARTERRE.z)
    for (const [r, da, s] of [
      [31, 0, 2.2],
      [25, 0.16, 1.1],
      [25, -0.16, 1.1],
      [37, 0.12, 1.1],
      [37, -0.12, 1.1],
      [12.2, 0, 1.3],
    ] as const) {
      col.setHSL(0.29, 0.45, 0.18)
      const x = PARTERRE.x + Math.cos(a + da) * r
      const z = PARTERRE.z + Math.sin(a + da) * r
      B('box').add(x, y0 + s * 0.85, z, s, s, s, 0, 0, 0, col)
    }
    for (const da of [-0.5, 0.5]) {
      const x = PARTERRE.x + Math.cos(a + da) * 41
      const z = PARTERRE.z + Math.sin(a + da) * 41
      B('cone').add(x, y0, z, 1.2, 3.8, 1.2)
    }
  }

  // pole kwiatów
  const flowerPal = ['#e9b8a6', '#c46a4a', '#f3ead8', '#b49ad1', '#a83a3a', '#f0c96a'].map(hex)
  // jasna, słoneczna paleta dla pełnych kwiatów; gatunek losowany niezależnie od koloru
  const tulipPal = ['#e8384a', '#f5874f', '#f7cf3e', '#f29bb4', '#ffffff'].map(hex)
  const daisyPal = ['#fdfaf2', '#f7b3c8', '#c9a6ee', '#fbe7a2', '#ffffff'].map(hex)
  const pickFlower = (pn: number) => {
    const r = rnd()
    const kind = r < 0.2 ? 'bud' : r < 0.2 + 0.35 + (pn - 0.5) * 0.3 ? 'tulip' : 'daisy'
    const pal = kind === 'tulip' ? tulipPal : kind === 'daisy' ? daisyPal : rnd() < 0.5 ? tulipPal : daisyPal
    const i = Math.min(pal.length - 1, Math.floor(((pn * 1.7 + rnd() * 0.9) % 1) * pal.length))
    col.copy(pal[i]).multiplyScalar(R(0.92, 1.05))
    return kind
  }
  const nFlowers = hi ? 30000 : 9000
  for (let a = 0, n = 0; a < nFlowers * 2 && n < nFlowers; a++) {
    const z = R(FLOWERS.z1, FLOWERS.z0)
    const x = pathX(z) + R(-46, 46)
    if (Math.abs(x - pathX(z)) < 1.9) continue
    const fade = smoothstep(46, 30, Math.abs(x - pathX(z))) * smoothstep(0, 14, FLOWERS.z0 - z) * smoothstep(0, 14, z - FLOWERS.z1)
    if (rnd() > fade) continue
    const pn = noise(x * 0.045, z * 0.045) * 0.5 + 0.5
    const ci = Math.min(flowerPal.length - 1, Math.floor((pn + R(-0.08, 0.08)) * flowerPal.length))
    col.copy(flowerPal[Math.max(0, ci)]).multiplyScalar(R(0.85, 1.1))
    const d = Math.abs(x - pathX(z))
    if (d < (hi ? 16 : 11)) {
      // blisko ścieżki: pełne kwiaty z płatkami, liśćmi i pąkami
      const kind = pickFlower(pn)
      const s = R(1.25, 1.9)
      B(kind).add(x, heightAt(x, z) - 0.02, z, s, s * R(0.85, 1.2), s, R(0, 6.28), R(-0.14, 0.14), R(-0.14, 0.14), col)
    } else {
      // dalej: same główki (z daleka i tak wyglądają jak plamy koloru)
      const s = R(0.09, 0.19)
      B('flower').add(x, heightAt(x, z) + R(0.3, 0.7), z, s, s * 0.5, s, R(0, 6.28), R(-0.3, 0.3), R(-0.3, 0.3), col)
    }
    n++
  }

  // dodatkowe pełne kwiaty tuż przy ścieżce, gdzie kamera schodzi nisko
  for (let a = 0, n = 0, nNear = hi ? 9000 : 3000; a < nNear * 3 && n < nNear; a++) {
    const z = R(FLOWERS.z1 + 6, FLOWERS.z0 - 6)
    const side = rnd() < 0.5 ? -1 : 1
    const d = 1.9 + Math.pow(rnd(), 1.4) * 12
    const x = pathX(z) + side * d
    const pn = noise(x * 0.045, z * 0.045) * 0.5 + 0.5
    const kind = pickFlower(pn)
    const s = R(1.25, 1.9)
    B(kind).add(x, heightAt(x, z) - 0.02, z, s, s * R(0.85, 1.2), s, R(0, 6.28), R(-0.14, 0.14), R(-0.14, 0.14), col)
    n++
  }

  // pergola z różami i lampionami
  const rosePal = ['#d9798a', '#a8283f', '#f3e1d4', '#e9a5a0'].map(hex)
  let arch = 0
  for (let z = PERGOLA.z0; z >= PERGOLA.z1; z -= 6, arch++) {
    const cx = pathX(z)
    const y = pathY(z)
    for (const side of [-1, 1]) B('wood').add(cx + side * 2.5, y + 1.7, z, 0.26, 3.4, 0.26)
    B('wood').add(cx, y + 3.45, z, 5.8, 0.24, 0.3)
    if (z - 6 >= PERGOLA.z1) {
      const cz = z - 3
      const cxm = pathX(cz)
      for (const side of [-1, 1]) B('wood').add(cxm + side * 2.5, y + 3.62, cz, 0.22, 0.2, 6.1)
      for (let s = 1; s < 5; s++) {
        const zz = z - s * 1.2
        B('wood').add(pathX(zz), y + 3.76, zz, 5.6, 0.08, 0.14)
      }
    }
    for (let r = 0; r < (hi ? 110 : 55); r++) {
      const onPost = rnd() < 0.55
      const side = rnd() < 0.5 ? -1 : 1
      const rx = onPost ? cx + side * (2.5 + R(-0.35, 0.35)) : cx + R(-2.9, 2.9)
      const ry = onPost ? y + R(0.3, 3.4) : y + 3.5 + R(-0.25, 0.35)
      const rz = onPost ? z + R(-0.4, 0.4) : z - R(0, 6)
      col.copy(rosePal[Math.floor(rnd() * rosePal.length)])
      const s = R(0.12, 0.2)
      B('rose').add(rx, ry, rz, s, s, s, R(0, 6.28), R(-0.9, 0.9), R(-0.9, 0.9), col)
      if (rnd() < 0.5) {
        col.setHSL(0.3, 0.45, R(0.18, 0.28))
        B('leaf').add(rx + R(-0.2, 0.2), ry + R(-0.2, 0.2), rz + R(-0.2, 0.2), s * 1.6, s * 1.6, s * 1.6, R(0, 6.28), R(-0.8, 0.8), R(-0.5, 0.5), col)
      }
    }
    if (arch % 2 === 0) B('lantern').add(cx, y + 2.85, z, 0.16, 0.22, 0.16)
  }

  const out: Record<string, Inst> = {}
  for (const [k, b] of Object.entries(inst)) out[k] = b.out()
  return {
    terrain: { pos, nor, col: colr, idx },
    tex: { data: tex, w: tw, h: th },
    inst: out,
  }
}

const Z_LAST = -1080

self.onmessage = (e: MessageEvent<GenOptions>) => {
  const res = generate(e.data)
  const transfer: Transferable[] = [
    res.terrain.pos.buffer,
    res.terrain.nor.buffer,
    res.terrain.col.buffer,
    res.terrain.idx.buffer,
    res.tex.data.buffer,
  ]
  for (const i of Object.values(res.inst)) {
    transfer.push(i.m.buffer)
    if (i.c) transfer.push(i.c.buffer)
  }
  ;(self as unknown as Worker).postMessage(res, transfer)
}
