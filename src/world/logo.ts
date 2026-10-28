/** Logo Green Art w 3D: wieniec z perłowych liści unoszący się nad ścieżką. */
import { ExtrudeGeometry, Group, Mesh, MeshPhysicalMaterial, Shape, TorusGeometry, type Texture } from 'three'

export function createLogo(env: Texture | null) {
  const leaf = new Shape()
  leaf.moveTo(0, 0)
  leaf.bezierCurveTo(0.06, -0.05, 0.135, -0.05, 0.2, 0)
  leaf.bezierCurveTo(0.135, 0.05, 0.06, 0.05, 0, 0)
  const geo = new ExtrudeGeometry(leaf, { depth: 0.02, bevelEnabled: true, bevelThickness: 0.016, bevelSize: 0.012, bevelSegments: 3, curveSegments: 10 })
  geo.translate(0, 0, -0.012)

  const mat = new MeshPhysicalMaterial({
    color: '#f6efd9',
    roughness: 0.16,
    metalness: 0.25,
    clearcoat: 1,
    clearcoatRoughness: 0.08,
    iridescence: 0.7,
    iridescenceIOR: 1.35,
    envMap: env,
    envMapIntensity: 1.4,
    emissive: '#fff1c4',
    emissiveIntensity: 0.35,
  })

  const g = new Group()
  const R = 1
  const branch = (from: number, to: number) => {
    const dir = Math.sign(to - from)
    let i = 0
    for (let a = from + dir * 6; dir > 0 ? a <= to : a >= to; a += dir * 10.5, i++) {
      const rad = (-a * Math.PI) / 180 // oś Y w górę (w SVG w dół)
      const m = new Mesh(geo, mat)
      m.position.set(Math.cos(rad) * R, Math.sin(rad) * R, 0)
      const tangent = rad - (dir * Math.PI) / 2
      const tilt = ((i % 2 === 0 ? -38 : 38) * dir * Math.PI) / 180
      m.rotation.z = tangent - tilt
      m.rotation.y = (i % 2 ? 0.25 : -0.25) * dir
      m.scale.setScalar(0.85 + (i % 3) * 0.06)
      g.add(m)
    }
    const arc = Math.abs(to - from)
    const stem = new Mesh(new TorusGeometry(R, 0.012, 8, 64, (arc * Math.PI) / 180), mat)
    stem.rotation.z = (-Math.max(from, to) * Math.PI) / 180
    g.add(stem)
  }
  branch(102, 262)
  branch(78, -82)
  return { group: g, mat }
}
