/** Składa świat 3D z wygenerowanych danych i prowadzi kamerę po ścieżce. */
import {
  ACESFilmicToneMapping,
  BufferAttribute,
  BufferGeometry,
  Color,
  DirectionalLight,
  FogExp2,
  HemisphereLight,
  InstancedBufferAttribute,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  PCFSoftShadowMap,
  PMREMGenerator,
  PerspectiveCamera,
  Vector2,
  SRGBColorSpace,
  Scene,
  Vector3,
  WebGLRenderTarget,
  WebGLRenderer,
  HalfFloatType,
  type BufferGeometry as BG,
  type Material,
} from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { butterflies, dragonflies, petals } from './critters'
import { atmosphereAt } from './atmosphere'
import { createGlows, createGrass, createMotes, createSky, createWater, heightTexture, shared } from './fx'
import type { GenResult } from './gen.worker'
import { createLogo } from './logo'
import * as props from './props'
import { FINALE, PARTERRE, POND, WATER_LEVEL, camKeyAt, heightAt, pathX, pathY } from './shape'

export type Quality = 'high' | 'low'

/** Dodaje lekki ruch wiatru do roślin (wierzchołki wyżej kołyszą się mocniej). */
function windy<M extends Material>(mat: M, amp: number, whole = false) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = shared.uTime
    sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      #ifdef USE_INSTANCING
        vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
        float wv = sin(uTime * 1.6 + ip.x * 0.35 + ip.z * 0.27) + 0.4 * sin(uTime * 3.1 + ip.z);
        transformed.x += wv * ${amp.toFixed(3)} * ${whole ? '1.0' : 'max(position.y, 0.0)'};
        transformed.z += wv * ${(amp * 0.4).toFixed(3)} * ${whole ? '1.0' : 'max(position.y, 0.0)'};
      #endif`,
    )
  }
  return mat
}

/** Oddaje sterowanie przeglądarce, żeby budowa sceny nie blokowała strony jednym długim zadaniem */
const pause = () => new Promise<void>((r) => setTimeout(r, 0))

export async function createWorld(canvas: HTMLCanvasElement, data: GenResult, quality: Quality, onProgress: (p: number) => void = () => {}) {
  const hi = quality === 'high'
  const renderer = new WebGLRenderer({ canvas, antialias: hi, powerPreference: 'high-performance', stencil: false })
  const dpr = Math.min(window.devicePixelRatio || 1, hi ? 1.75 : 1.35)
  renderer.setPixelRatio(dpr)
  renderer.outputColorSpace = SRGBColorSpace
  renderer.toneMapping = ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.05
  // cienie tylko na mocniejszym sprzęcie
  if (hi) {
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = PCFSoftShadowMap
  }

  const scene = new Scene()
  scene.fog = new FogExp2('#dfe4c2', 0.01)
  const camera = new PerspectiveCamera(55, 1, 0.1, 1500)

  const hemi = new HemisphereLight('#fff', '#444', 1)
  const sun = new DirectionalLight('#fff', 2)
  if (hi) {
    // „pudełko” cieni podąża za kamerą
    sun.castShadow = true
    sun.shadow.mapSize.set(2048, 2048)
    const sc = sun.shadow.camera
    sc.left = sc.bottom = -48
    sc.right = sc.top = 48
    sc.near = 1
    sc.far = 320
    sun.shadow.bias = -0.0006
    sun.shadow.normalBias = 0.05
  }
  scene.add(hemi, sun, sun.target)

  const sky = createSky()
  scene.add(sky.mesh)
  await pause()

  // ——— Teren ———
  const tg = new BufferGeometry()
  tg.setAttribute('position', new BufferAttribute(data.terrain.pos, 3))
  tg.setAttribute('normal', new BufferAttribute(data.terrain.nor, 3))
  tg.setAttribute('color', new BufferAttribute(data.terrain.col, 3))
  tg.setIndex(new BufferAttribute(data.terrain.idx, 1))
  tg.computeBoundingSphere()
  const terrain = new Mesh(tg, new MeshLambertMaterial({ vertexColors: true }))
  terrain.receiveShadow = true
  scene.add(terrain)
  onProgress(80)
  await pause()

  // ——— Trawa ———
  const tex = heightTexture(data.tex.data, data.tex.w, data.tex.h)
  const grass = createGrass(tex, hi ? 260000 : 50000, hi ? 64 : 42, hi)
  scene.add(grass.mesh)
  await pause()

  // ——— Obiekty (instancje) ———
  const lambert = (o: ConstructorParameters<typeof MeshLambertMaterial>[0] = {}) => new MeshLambertMaterial({ vertexColors: true, ...o })
  const add = (name: string, geo: BG, mat: Material, colors = true, cast = true, receive = false) => {
    const d = data.inst[name]
    if (!d) return null
    const n = d.m.length / 16
    const mesh = new InstancedMesh(geo, mat, n)
    mesh.instanceMatrix = new InstancedBufferAttribute(d.m, 16)
    if (colors && d.c) mesh.instanceColor = new InstancedBufferAttribute(d.c, 3)
    mesh.computeBoundingSphere()
    mesh.castShadow = hi && cast
    mesh.receiveShadow = hi && receive
    scene.add(mesh)
    return mesh
  }
  const trunkMat = new MeshLambertMaterial({ color: '#5a4636' })
  const trunkGeo = props.trunk()
  const canopy = props.treeCanopy()
  add('tree', canopy, windy(lambert(), 0.02))
  add('tree', trunkGeo, trunkMat, false)
  add('maple', canopy, windy(lambert(), 0.03))
  add('maple', trunkGeo, trunkMat, false)
  add('conifer', props.conifer(), lambert())
  add('conifer', trunkGeo, trunkMat, false)
  add('poplar', props.poplar(), windy(lambert(), 0.015))
  await pause()
  const rockGeo = props.rock()
  add('rock', rockGeo, lambert())
  add('stone', props.stone(), lambert(), true, false, true)
  add('lily', props.lilyPad(), new MeshLambertMaterial({ color: '#ffffff' }), true, false, true)
  add('lotus', props.flowerHead(), new MeshLambertMaterial({ color: '#ffffff', emissive: '#3a1f24' }), true, false)
  await pause()
  add('lavender', props.lavender(), windy(lambert(), 0.12), true, true, true)
  add('box', props.boxwood(), lambert(), true, true, true)
  add('cone', props.topiaryCone(), lambert())
  await pause()
  add('flower', props.flowerHead(), windy(new MeshLambertMaterial({ color: '#ffffff', emissive: '#2a2018' }), 0.35, true), true, false, true)
  add('rose', props.blossom(), windy(new MeshLambertMaterial({ color: '#ffffff', emissive: '#2a1414' }), 0.25, true))
  add('leaf', props.flowerHead(), new MeshLambertMaterial({ color: '#ffffff' }))
  add('wood', props.wood(), new MeshLambertMaterial({ color: '#7d5c40' }), false, true, true)
  // lampion świeci mocniej niż biel — dzięki temu łapie poświatę (bloom)
  const lanternMat = new MeshBasicMaterial()
  lanternMat.color.setRGB(4, 2.6, 1.3)
  const lanternGeo = props.lantern()
  lanternGeo.scale(0.55, 0.55, 0.55)
  add('lantern', lanternGeo, lanternMat, false, false)

  onProgress(86)
  await pause()
  // fontanna w parterze
  const fountain = new Mesh(props.fountain(), lambert())
  fountain.castShadow = fountain.receiveShadow = hi
  fountain.position.set(PARTERRE.x, pathY(PARTERRE.z), PARTERRE.z)
  scene.add(fountain)

  // woda w stawie
  const water = createWater(POND.rx * 1.2, POND.rz * 1.2, WATER_LEVEL, POND.x, POND.z)
  scene.add(water.mesh)

  // poświata lampionów
  const lm = data.inst.lantern?.m
  const lp = new Float32Array(lm ? (lm.length / 16) * 3 : 0)
  if (lm) for (let i = 0; i < lm.length / 16; i++) lp.set([lm[i * 16 + 12], lm[i * 16 + 13], lm[i * 16 + 14]], i * 3)
  const glows = createGlows(lp, 2.2, '#ffb86b')
  scene.add(glows.points)

  const motes = createMotes(hi ? 1400 : 600, 70)
  scene.add(motes.points)
  motes.mat.uniforms.uPx.value = dpr
  glows.mat.uniforms.uPx.value = dpr

  // motyle, ważki nad stawem i opadające płatki
  const flies = butterflies(hi ? 90 : 36)
  const drag = dragonflies(hi ? 14 : 8, new Vector3(POND.x, WATER_LEVEL, POND.z), POND.rx * 0.8)
  const pet = petals(hi ? 520 : 180)
  scene.add(flies.mesh, drag.mesh, pet.mesh)
  const critters = [flies.mat, drag.mat, pet.mat]

  await pause()
  // ——— Logo (na początku i na końcu drogi) ———
  const pm = new PMREMGenerator(renderer)
  const env = pm.fromScene(new RoomEnvironment(), 0.04).texture
  const logoA = createLogo(env)
  logoA.group.position.set(pathX(4), pathY(4) + 3.4, 4)
  logoA.group.scale.setScalar(2.7)
  const logoB = createLogo(env)
  logoB.group.position.set(FINALE.x, pathY(FINALE.z) + 11, FINALE.z + 6)
  logoB.group.scale.setScalar(8.5)
  for (const l of [logoA, logoB]) l.group.traverse((o) => (o.castShadow = hi))
  scene.add(logoA.group, logoB.group)
  pm.dispose()
  onProgress(90)
  await pause()

  // ——— Efekty kinowe (tylko mocny sprzęt): poświata jasnych miejsc + lekka aberracja na brzegach ———
  let composer: EffectComposer | null = null
  let bloom: UnrealBloomPass | null = null
  if (hi) {
    // bufor z wygładzaniem krawędzi (MSAA), żeby efekty nie dawały „schodków”
    composer = new EffectComposer(renderer, new WebGLRenderTarget(innerWidth * dpr, innerHeight * dpr, { type: HalfFloatType, samples: 4 }))
    composer.setPixelRatio(dpr)
    composer.addPass(new RenderPass(scene, camera))
    bloom = new UnrealBloomPass(new Vector2(512, 512), 0.3, 0.5, 2.4)
    composer.addPass(bloom)
    composer.addPass(new OutputPass())
    composer.addPass(
      new ShaderPass({
        uniforms: { tDiffuse: { value: null }, uAmount: { value: 0.0025 } },
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: /* glsl */ `
          uniform sampler2D tDiffuse; uniform float uAmount; varying vec2 vUv;
          void main(){
            vec2 d = vUv - 0.5;
            float k = dot(d, d) * 4.0;
            vec2 off = d * uAmount * k;
            vec3 c = vec3(texture2D(tDiffuse, vUv + off).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - off).b);
            gl_FragColor = vec4(c, 1.0);
          }`,
      }),
    )
  }
  const draw = () => (composer ? composer.render() : renderer.render(scene, camera))

  // ——— Kamera ———
  const camPos = new Vector3()
  const look = new Vector3()
  const fwd = new Vector3()
  const pointer = { x: 0, y: 0, sx: 0, sy: 0 }
  let lastZ = Number.NaN

  function setSize(w: number, h: number) {
    renderer.setSize(w, h, false)
    composer?.setSize(w, h)
    camera.aspect = w / h
    // na pionowym ekranie szerszy kąt, żeby zmieścić krajobraz
    camera.fov = w / h < 0.8 ? 72 : w / h < 1.2 ? 62 : 52
    camera.updateProjectionMatrix()
  }

  function placeCamera(z: number) {
    const k = camKeyAt(z)
    const ground = Math.max(pathY(z), heightAt(pathX(z), z), WATER_LEVEL + 0.1)
    pointer.sx += (pointer.x - pointer.sx) * 0.04
    pointer.sy += (pointer.y - pointer.sy) * 0.04
    camPos.set(pathX(z) + pointer.sx * 0.9, ground + k.h + pointer.sy * 0.35, z)
    const lz = z - k.ahead
    look.set(pathX(lz) + pointer.sx * 2.2, pathY(lz) + k.lookH - pointer.sy * 0.8, lz)
    camera.position.copy(camPos)
    camera.lookAt(look)
  }

  function render(z: number, dt: number, animate: boolean) {
    if (animate) shared.uTime.value += dt
    placeCamera(z)
    if (z !== lastZ) {
      const a = atmosphereAt(z)
      ;(scene.fog as FogExp2).color.copy(a.fog)
      ;(scene.fog as FogExp2).density = a.density
      renderer.setClearColor(a.fog)
      sky.mat.uniforms.uTop.value.copy(a.top)
      sky.mat.uniforms.uHorizon.value.copy(a.horizon)
      sky.mat.uniforms.uSun.value.copy(a.sun)
      sky.mat.uniforms.uSunDir.value.copy(a.sunDir)
      water.mat.uniforms.uTop.value.copy(a.top)
      water.mat.uniforms.uHorizon.value.copy(a.horizon)
      water.mat.uniforms.uSun.value.copy(a.sun)
      water.mat.uniforms.uSunDir.value.copy(a.sunDir)
      hemi.color.copy(a.hemiSky)
      hemi.groundColor.copy(a.hemiGround)
      hemi.intensity = a.hemiI
      sun.color.copy(a.sun)
      sun.intensity = a.sunI
      grass.mat.uniforms.uTip.value.copy(a.grassTip)
      grass.mat.uniforms.uSun.value.copy(a.sun)
      grass.mat.uniforms.uLight.value.copy(a.hemiSky).lerp(new Color(1, 1, 1), 0.6).multiplyScalar(0.55 + a.hemiI * 0.35)
      motes.mat.uniforms.uGlow.value = 0.35 + a.glow * 0.9
      motes.mat.uniforms.uColor.value.set(a.glow > 0.8 ? '#ffd08a' : '#fff6da')
      glows.mat.uniforms.uGlow.value = 0.4 + a.glow
      for (const m of critters) m.uniforms.uLight.value.copy(grass.mat.uniforms.uLight.value).multiplyScalar(1.15)
      // w dzień subtelnie, o zachodzie słońca mocniej
      if (bloom) bloom.strength = 0.12 + a.glow * 0.5
      lastZ = z
    }
    // cienie liczone w pudełku przed kamerą
    fwd.copy(look).sub(camPos).setY(0).normalize()
    sun.target.position.copy(camPos).addScaledVector(fwd, 26)
    sun.position.copy(sun.target.position).addScaledVector(atmosphereAt(z).sunDir, 150)
    sky.mesh.position.copy(camPos)
    grass.mat.uniforms.uCam.value.set(camPos.x, camPos.z)
    motes.mat.uniforms.uCam.value.copy(camPos)
    const ground = pathY(z)
    for (const m of critters) {
      m.uniforms.uCam.value.copy(camPos)
      m.uniforms.uGround.value = ground
    }
    const t = shared.uTime.value
    for (const [l, base] of [
      [logoA, 4],
      [logoB, FINALE.z + 6],
    ] as const) {
      l.group.rotation.y = Math.sin(t * 0.35 + base) * 0.35
      l.group.rotation.x = Math.sin(t * 0.25) * 0.06
      l.group.position.y = (base === 4 ? pathY(4) + 3.4 : pathY(FINALE.z) + 11) + Math.sin(t * 0.8) * 0.25
    }
    draw()
  }

  return {
    renderer,
    setSize,
    render,
    pointer,
    /** Kompiluje shadery (równolegle, jeśli przeglądarka pozwala) i wysyła dane do karty graficznej */
    async warmup(z: number) {
      placeCamera(z)
      await renderer.compileAsync(scene, camera).catch(() => {})
      draw()
      onProgress(100)
    },
  }
}

export type World = Awaited<ReturnType<typeof createWorld>>
