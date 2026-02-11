import {
  useMotionValue,
  useSpring,
  useTransform,
  useMotionValueEvent,
  useReducedMotion,
  motion,
} from 'framer-motion'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n))
}

function normalizePointer(e: PointerEvent, rect: DOMRect): { x: number; y: number } {
  const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1
  const ny = ((e.clientY - rect.top) / rect.height) * 2 - 1
  return { x: clamp(nx, -1, 1), y: clamp(ny, -1, 1) }
}

export default function TiltStage(props: {
  children: React.ReactNode
  enabled?: boolean
  strength?: number
  theme?: 'dark' | 'light'
}) {
  const { children, enabled = true, strength = 1, theme = 'dark' } = props
  const reduce = useReducedMotion()
  const effectiveStrength = enabled && !reduce ? clamp(strength, 0, 1) : 0

  const stageRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const threeRef = useRef<{
    renderer: THREE.WebGLRenderer
    scene: THREE.Scene
    camera: THREE.PerspectiveCamera
    group: THREE.Group
    material: THREE.ShaderMaterial
    grid: THREE.GridHelper
    dispose: () => void
  } | null>(null)

  const mx = useMotionValue(0)
  const my = useMotionValue(0)
  const sx = useSpring(mx, { stiffness: 260, damping: 34, mass: 0.9 })
  const sy = useSpring(my, { stiffness: 260, damping: 34, mass: 0.9 })

  const rotateY = useTransform(sx, (v) => v * 8 * effectiveStrength)
  const rotateX = useTransform(sy, (v) => v * -8 * effectiveStrength)
  const pointerUvX = useTransform(sx, (v) => (v + 1) / 2)
  const pointerUvY = useTransform(sy, (v) => (v + 1) / 2)

  const shader = useMemo(
    () => ({
      vertex: `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`,
      fragment: `
precision highp float;
varying vec2 vUv;
uniform vec2 uPointer;

float easeInOut(float t) { return t * t * (3.0 - 2.0 * t); }

void main() {
  vec3 top = ${theme === 'dark' ? 'vec3(0.05, 0.09, 0.16)' : 'vec3(0.88, 0.94, 0.99)'};
  vec3 bot = ${theme === 'dark' ? 'vec3(0.02, 0.02, 0.05)' : 'vec3(0.75, 0.86, 0.95)'};
  float g = easeInOut(vUv.y);
  vec3 base = mix(bot, top, g);

  vec2 p = vUv - uPointer;
  float d = length(p);
  float glow = exp(-d * 7.5);
  vec3 accent = ${theme === 'dark' ? 'vec3(0.08, 0.28, 0.34)' : 'vec3(0.12, 0.34, 0.44)'} * glow * ${theme === 'dark' ? '0.85' : '0.52'};

  float vign = smoothstep(0.92, 0.18, distance(vUv, vec2(0.5)));
  vec3 color = base + accent + ${theme === 'dark' ? 'vec3(0.02, 0.06, 0.08)' : 'vec3(0.04, 0.08, 0.10)'} * vign;

  gl_FragColor = vec4(color, ${theme === 'dark' ? '0.95' : '0.6'});
}
`,
    }),
    [theme],
  )

  useEffect(() => {
    const canvas = canvasRef.current
    const stage = stageRef.current
    if (!canvas || !stage) return

    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true })
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1))
    renderer.setClearColor(0x000000, 0)

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100)
    camera.position.set(0, 0, 6.4)

    const group = new THREE.Group()
    scene.add(group)

    const material = new THREE.ShaderMaterial({
      transparent: true,
      uniforms: { uPointer: { value: new THREE.Vector2(0.5, 0.5) } },
      vertexShader: shader.vertex,
      fragmentShader: shader.fragment,
    })
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(6, 6, 1, 1), material)
    group.add(plane)

    const gridColor = theme === 'dark' ? 0x334155 : 0x94a3b8
    const grid = new THREE.GridHelper(6, 8, gridColor, gridColor)
    grid.rotation.x = Math.PI / 2
    grid.position.z = 0.01
    if (Array.isArray(grid.material)) {
      for (const m of grid.material) {
        m.transparent = true
        m.opacity = theme === 'dark' ? 0.28 : 0.18
      }
    } else {
      grid.material.transparent = true
      grid.material.opacity = theme === 'dark' ? 0.28 : 0.18
    }
    group.add(grid)

    let raf = 0
    const render = () => {
      renderer.render(scene, camera)
      raf = requestAnimationFrame(render)
    }
    render()

    const ro = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) return
      const cr = entry.contentRect
      const w = Math.max(1, cr.width)
      const h = Math.max(1, cr.height)
      renderer.setSize(w, h, false)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
    })
    ro.observe(stage)

    const dispose = () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      renderer.dispose()
      plane.geometry.dispose()
      material.dispose()
      if (Array.isArray(grid.material)) grid.material.forEach((m: THREE.Material) => m.dispose())
      else grid.material.dispose()
    }

    threeRef.current = { renderer, scene, camera, group, material, grid, dispose }
    return () => {
      threeRef.current?.dispose()
      threeRef.current = null
    }
  }, [shader.fragment, shader.vertex, theme])

  useMotionValueEvent(rotateX, 'change', (deg) => {
    const t = threeRef.current
    if (!t) return
    t.group.rotation.x = THREE.MathUtils.degToRad(deg)
  })
  useMotionValueEvent(rotateY, 'change', (deg) => {
    const t = threeRef.current
    if (!t) return
    t.group.rotation.y = THREE.MathUtils.degToRad(deg)
  })
  useMotionValueEvent(pointerUvX, 'change', (x) => {
    const t = threeRef.current
    if (!t) return
    t.material.uniforms.uPointer.value.x = x
  })
  useMotionValueEvent(pointerUvY, 'change', (y) => {
    const t = threeRef.current
    if (!t) return
    t.material.uniforms.uPointer.value.y = y
  })

  useEffect(() => {
    const el = stageRef.current
    if (!el) return

    if (effectiveStrength === 0) {
      mx.set(0)
      my.set(0)
      return
    }

    const handleMove = (e: PointerEvent) => {
      const rect = el.getBoundingClientRect()
      const n = normalizePointer(e, rect)
      mx.set(n.x)
      my.set(n.y)
    }

    const handleLeave = () => {
      mx.set(0)
      my.set(0)
    }

    el.addEventListener('pointermove', handleMove)
    el.addEventListener('pointerleave', handleLeave)
    return () => {
      el.removeEventListener('pointermove', handleMove)
      el.removeEventListener('pointerleave', handleLeave)
    }
  }, [effectiveStrength, mx, my])

  return (
    <div ref={stageRef} className="relative">
      <canvas
        ref={canvasRef}
        className="pointer-events-none absolute inset-0 h-full w-full rounded-2xl"
      />
      <motion.div
        style={{
          rotateX,
          rotateY,
          transformPerspective: 900,
          transformStyle: 'preserve-3d',
        }}
        className="relative will-change-transform"
      >
        {children}
      </motion.div>
    </div>
  )
}
