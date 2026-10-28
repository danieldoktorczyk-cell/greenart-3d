import Lenis from 'lenis'
import './style.css'
import type { GenResult } from './world/gen.worker'
import GenWorker from './world/gen.worker?worker'
import type { Quality, World } from './world/scene'
import { Z_END, Z_START } from './world/shape'

const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches || location.search.includes('reduced-motion')
const sections = [...document.querySelectorAll<HTMLElement>('#journey > section')]
const canvas = document.getElementById('gl') as HTMLCanvasElement
const loader = document.getElementById('loader')!
const bar = document.getElementById('loader-bar')!
const pct = document.getElementById('loader-pct')!
const fade = document.getElementById('fade')!

// ——— Płynny scroll ———
const lenis = reduce ? null : new Lenis({ lerp: 0.085, wheelMultiplier: 0.85 })

function goTo(id: string) {
  const el = document.getElementById(id)
  if (!el) return
  if (lenis) lenis.scrollTo(el, { duration: 2.4, easing: (t) => 1 - Math.pow(1 - t, 3) })
  else el.scrollIntoView()
  el.setAttribute('tabindex', '-1')
  el.focus({ preventScroll: true })
}
document.querySelectorAll<HTMLElement>('[data-go]').forEach((a) =>
  a.addEventListener('click', (e) => {
    e.preventDefault()
    goTo(a.dataset.go!)
  }),
)

// ——— Mapowanie: pozycja scrolla → miejsce na ścieżce (oś z) ———
let stops: { top: number; z: number }[] = []
function measure() {
  stops = sections.map((s) => ({ top: s.offsetTop, z: Number(s.dataset.z) }))
}
function zForScroll(y: number) {
  if (y <= stops[0].top) return stops[0].z
  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i]
    const b = stops[i + 1]
    if (y <= b.top) return a.z + ((y - a.top) / (b.top - a.top)) * (b.z - a.z)
  }
  return stops[stops.length - 1].z
}
/** Przy ograniczonym ruchu kamera nie leci, tylko przeskakuje do najbliższego etapu */
function snappedZ(y: number) {
  const mid = y + innerHeight * 0.5
  let best = stops[0]
  for (const s of stops) if (s.top <= mid) best = s
  return best.z
}

// ——— Aktywny etap: karty i mapa podróży ———
const trail = [...document.querySelectorAll<HTMLAnchorElement>('#trail [data-go]')]
const io = new IntersectionObserver(
  (entries) => {
    for (const e of entries) e.target.classList.toggle('is-in', e.isIntersecting)
  },
  { rootMargin: '-15% 0px -15% 0px' },
)
sections.forEach((s) => io.observe(s))
let lastTrail = ''
function updateTrail(y: number) {
  const mid = y + innerHeight * 0.45
  let id = sections[0].id
  stops.forEach((s, i) => {
    if (s.top <= mid) id = sections[i].id
  })
  if (id === lastTrail) return
  lastTrail = id
  for (const a of trail) {
    if (a.dataset.go === id) a.setAttribute('aria-current', 'step')
    else a.removeAttribute('aria-current')
  }
}

// ——— Świat 3D ———
let world: World | null = null
let zNow = Z_START
let zShown = Z_START

function setLoad(p: number) {
  bar.style.width = `${p}%`
  pct.textContent = `${Math.round(p)}%`
}
function hideLoader() {
  loader.style.opacity = '0'
  loader.style.visibility = 'hidden'
  loader.setAttribute('aria-busy', 'false')
}

// bez tworzenia testowego kontekstu (to kosztowne) — sprawdzamy tylko, czy przeglądarka zna WebGL2
const webglOk = () => 'WebGL2RenderingContext' in window

async function boot() {
  measure()
  if (!webglOk()) {
    document.documentElement.classList.add('no-gl')
    hideLoader()
    return
  }
  const lowEnd = matchMedia('(max-width: 820px)').matches || (navigator.hardwareConcurrency || 8) <= 4
  const quality: Quality = lowEnd ? 'low' : 'high'
  setLoad(8)
  // generowanie terenu w tle + równoległe pobranie modułu sceny
  let fake = 8
  const tick = setInterval(() => setLoad((fake = Math.min(70, fake + 4))), 120)
  const worker = new GenWorker()
  const dataP = new Promise<GenResult>((res) => {
    worker.onmessage = (e: MessageEvent<GenResult>) => res(e.data)
    worker.postMessage({ quality })
  })
  const [data, mod] = await Promise.all([dataP, import('./world/scene')])
  clearInterval(tick)
  worker.terminate()
  setLoad(78)
  try {
    world = await mod.createWorld(canvas, data, quality, setLoad)
  } catch {
    document.documentElement.classList.add('no-gl')
    hideLoader()
    return
  }
  world.setSize(innerWidth, innerHeight)
  zNow = zShown = reduce ? snappedZ(scrollY) : zForScroll(scrollY)
  await world.warmup(zNow)
  setLoad(100)
  world.render(zNow, 0, false)
  setTimeout(hideLoader, 250)
  requestAnimationFrame(loop)
}

let last = performance.now()
function loop(now: number) {
  requestAnimationFrame(loop)
  const dt = Math.min(0.05, (now - last) / 1000)
  last = now
  lenis?.raf(now)
  const y = lenis ? lenis.scroll : scrollY
  updateTrail(y)
  if (!world || document.hidden) return
  if (reduce) {
    const target = snappedZ(y)
    if (target !== zShown) {
      // krótkie przejście przez ciemność zamiast lotu kamery
      zShown = target
      fade.style.opacity = '1'
      setTimeout(() => {
        zNow = target
        fade.style.opacity = '0'
      }, 300)
    }
  } else {
    const target = zForScroll(y)
    zNow += (target - zNow) * (1 - Math.exp(-dt * 3.2))
  }
  world.render(Math.max(Z_END, Math.min(Z_START, zNow)), dt, !reduce)
}

// ruch kursora = delikatne rozglądanie się
window.addEventListener(
  'pointermove',
  (e: PointerEvent) => {
    if (!world || reduce || e.pointerType !== 'mouse') return
    world.pointer.x = (e.clientX / innerWidth) * 2 - 1
    world.pointer.y = -((e.clientY / innerHeight) * 2 - 1)
  },
  { passive: true },
)
window.addEventListener('resize', () => {
  measure()
  world?.setSize(innerWidth, innerHeight)
})
if (!world) requestAnimationFrame(function pre(now) {
  // zanim świat się wczyta, Lenis i mapa podróży już działają
  if (world) return
  lenis?.raf(now)
  updateTrail(lenis ? lenis.scroll : scrollY)
  requestAnimationFrame(pre)
})

document.fonts?.ready.then(measure)
window.addEventListener('load', measure)
boot()

// ——— Formularz (bez serwera: otwiera program pocztowy) ———
const form = document.getElementById('form') as HTMLFormElement
const statusEl = document.getElementById('form-status')!
form.addEventListener('submit', (e) => {
  e.preventDefault()
  const v = (id: string) => (document.getElementById(id) as HTMLInputElement).value.trim()
  const checks: [string, string, boolean][] = [
    ['f-name', 'e-name', v('f-name').length >= 2],
    ['f-email', 'e-email', /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v('f-email'))],
    ['f-msg', 'e-msg', v('f-msg').length >= 10],
    ['f-ok', 'e-ok', (document.getElementById('f-ok') as HTMLInputElement).checked],
  ]
  let first: HTMLElement | null = null
  for (const [f, err, ok] of checks) {
    const input = document.getElementById(f)!
    const msg = document.getElementById(err)!
    input.setAttribute('aria-invalid', String(!ok))
    if (!ok) input.setAttribute('aria-describedby', err)
    else input.removeAttribute('aria-describedby')
    msg.classList.toggle('hidden', ok)
    if (!ok && !first) first = input
  }
  if (first) {
    first.focus()
    return
  }
  const body = `${v('f-msg')}\n\n—\n${v('f-name')}\n${v('f-email')}`
  window.location.href = `mailto:greenartprzemkow@gmail.com?subject=${encodeURIComponent('Zapytanie ze strony Green Art')}&body=${encodeURIComponent(body)}`
  statusEl.textContent = 'Otworzyliśmy Twój program pocztowy z gotową wiadomością — wystarczy kliknąć „Wyślij”. Jeśli nic się nie pojawiło, zadzwoń: 668 327 731.'
  statusEl.classList.remove('hidden')
  statusEl.setAttribute('tabindex', '-1')
  statusEl.focus()
})
