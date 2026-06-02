import { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useThree, type ThreeEvent } from '@react-three/fiber'
import { Billboard, Grid, OrbitControls, RoundedBox, Text } from '@react-three/drei'
import * as THREE from 'three'
import type { FloorItem, FloorPlan, Zone } from '../types'
import { STATUS_COLORS } from '../types'

interface Props {
  floor: FloorPlan
  zones: Zone[]
  items: FloorItem[]
  selectedId: string | null
  onSelect: (id: string | null) => void
  onMoveItem: (id: string, x: number, y: number) => void
}

/**
 * 3D top-down-ish workshop. World coordinates (x: 0..floor.width,
 * y: 0..floor.height) map to scene coordinates centred on the origin:
 * sceneX = worldX - W/2, sceneZ = worldY - H/2, with Y as height.
 */
export function Scene3D({ floor, zones, items, selectedId, onSelect, onMoveItem }: Props) {
  const W = floor.width
  const H = floor.height
  const [dragging, setDragging] = useState<string | null>(null)
  // Offset between the grabbed point and the item centre, in scene units.
  const grabOffset = useRef<{ x: number; z: number }>({ x: 0, z: 0 })

  function beginDrag(item: FloorItem, point: THREE.Vector3) {
    const sceneX = item.x - W / 2
    const sceneZ = item.y - H / 2
    grabOffset.current = { x: point.x - sceneX, z: point.z - sceneZ }
    setDragging(item.id)
    onSelect(item.id)
  }

  function onDragTo(sceneX: number, sceneZ: number) {
    if (!dragging) return
    const worldX = clamp(sceneX - grabOffset.current.x + W / 2, 0, W)
    const worldY = clamp(sceneZ - grabOffset.current.z + H / 2, 0, H)
    onMoveItem(dragging, worldX, worldY)
  }

  useEffect(() => {
    if (!dragging) return
    const end = () => setDragging(null)
    window.addEventListener('pointerup', end)
    return () => window.removeEventListener('pointerup', end)
  }, [dragging])

  const camStart: [number, number, number] = [0, Math.max(W, H) * 0.7, H * 0.95]

  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      camera={{ position: camStart, fov: 42, near: 1, far: 8000 }}
      onPointerMissed={() => onSelect(null)}
    >
      <color attach="background" args={['#dbeafe']} />
      <fog attach="fog" args={['#dbeafe', Math.max(W, H) * 1.2, Math.max(W, H) * 3]} />

      <Lights W={W} H={H} />

      <Ground W={W} H={H} imageDataUrl={floor.imageDataUrl} />
      <DragSurface enabled={!!dragging} W={W} H={H} onDrag={onDragTo} />

      {zones.map((z) => (
        <Zone3D key={z.id} zone={z} W={W} H={H} />
      ))}

      {items.map((item) => (
        <Item3D
          key={item.id}
          item={item}
          W={W}
          H={H}
          selected={item.id === selectedId}
          onGrab={beginDrag}
        />
      ))}

      <OrbitControls
        makeDefault
        enabled={!dragging}
        enablePan
        target={[0, 0, 0]}
        maxPolarAngle={Math.PI * 0.48}
        minDistance={150}
        maxDistance={Math.max(W, H) * 2.5}
      />
    </Canvas>
  )
}

function Lights({ W, H }: { W: number; H: number }) {
  const size = Math.max(W, H)
  return (
    <>
      <hemisphereLight args={['#ffffff', '#b6c2cf', 0.7]} />
      <ambientLight intensity={0.35} />
      <directionalLight
        position={[size * 0.4, size * 0.9, size * 0.3]}
        intensity={1.5}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-size}
        shadow-camera-right={size}
        shadow-camera-top={size}
        shadow-camera-bottom={-size}
        shadow-camera-near={1}
        shadow-camera-far={size * 3}
      />
    </>
  )
}

function Ground({
  W,
  H,
  imageDataUrl,
}: {
  W: number
  H: number
  imageDataUrl: string | null
}) {
  const [texture, setTexture] = useState<THREE.Texture | null>(null)
  useEffect(() => {
    if (!imageDataUrl) {
      setTexture(null)
      return
    }
    const tex = new THREE.TextureLoader().load(imageDataUrl, (t) => {
      t.colorSpace = THREE.SRGBColorSpace
      t.needsUpdate = true
    })
    setTexture(tex)
    return () => tex.dispose()
  }, [imageDataUrl])

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[W, H]} />
        <meshStandardMaterial color={texture ? '#ffffff' : '#eef2f7'} map={texture ?? undefined} />
      </mesh>
      <Grid
        position={[0, 0.05, 0]}
        args={[W, H]}
        cellSize={40}
        cellThickness={0.6}
        cellColor="#cbd5e1"
        sectionSize={200}
        sectionThickness={1.1}
        sectionColor="#94a3b8"
        fadeDistance={Math.max(W, H) * 2.2}
        fadeStrength={1}
        infiniteGrid={false}
      />
    </group>
  )
}

/**
 * Invisible plane at y=0 used only while dragging. We raycast the pointer
 * against the mathematical ground plane so the drag stays accurate even when
 * the cursor passes over other items.
 */
function DragSurface({
  enabled,
  W,
  H,
  onDrag,
}: {
  enabled: boolean
  W: number
  H: number
  onDrag: (x: number, z: number) => void
}) {
  const { camera, gl } = useThree()
  useEffect(() => {
    if (!enabled) return
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
    const ray = new THREE.Raycaster()
    const ndc = new THREE.Vector2()
    const hit = new THREE.Vector3()
    function move(e: PointerEvent) {
      const rect = gl.domElement.getBoundingClientRect()
      ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
      ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1
      ray.setFromCamera(ndc, camera)
      if (ray.ray.intersectPlane(plane, hit)) onDrag(hit.x, hit.z)
    }
    window.addEventListener('pointermove', move)
    return () => window.removeEventListener('pointermove', move)
  }, [enabled, camera, gl, onDrag])
  // A wide invisible catcher (helps with the very first move event).
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} visible={false}>
      <planeGeometry args={[W * 4, H * 4]} />
      <meshBasicMaterial />
    </mesh>
  )
}

function Zone3D({ zone, W, H }: { zone: Zone; W: number; H: number }) {
  // Zone centre in scene coords.
  const cx = zone.x + zone.width / 2 - W / 2
  const cz = zone.y + zone.height / 2 - H / 2
  return (
    <group position={[cx, 0, cz]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.08, 0]}>
        <planeGeometry args={[zone.width, zone.height]} />
        <meshStandardMaterial
          color={zone.color}
          transparent
          opacity={zone.isAisle ? 0.16 : 0.24}
          polygonOffset
          polygonOffsetFactor={-1}
        />
      </mesh>
      <Text
        position={[-zone.width / 2 + 14, 0.2, -zone.height / 2 + 26]}
        rotation={[-Math.PI / 2, 0, 0]}
        fontSize={22}
        color={zone.color}
        anchorX="left"
        anchorY="top"
        outlineWidth={0.6}
        outlineColor="#ffffff"
      >
        {zone.name.toUpperCase()}
      </Text>
    </group>
  )
}

function Item3D({
  item,
  W,
  H,
  selected,
  onGrab,
}: {
  item: FloorItem
  W: number
  H: number
  selected: boolean
  onGrab: (item: FloorItem, point: THREE.Vector3) => void
}) {
  const [hovered, setHovered] = useState(false)
  const color = STATUS_COLORS[item.status]
  const cx = item.x - W / 2
  const cz = item.y - H / 2
  const hullH = Math.max(16, item.height * 0.5)

  function onDown(e: ThreeEvent<PointerEvent>) {
    e.stopPropagation()
    onGrab(item, e.point)
  }

  return (
    <group
      position={[cx, 0, cz]}
      rotation={[0, (-item.rotation * Math.PI) / 180, 0]}
      onPointerDown={onDown}
      onPointerOver={(e) => {
        e.stopPropagation()
        setHovered(true)
        document.body.style.cursor = 'grab'
      }}
      onPointerOut={() => {
        setHovered(false)
        document.body.style.cursor = 'auto'
      }}
    >
      {item.shape === 'boat' ? (
        <Boat length={item.width} beam={item.height} height={hullH} color={color} />
      ) : (
        <Vehicle length={item.width} width={item.height} height={hullH} color={color} />
      )}

      {/* Selection / hover ring on the ground. */}
      {(selected || hovered) && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.12, 0]}>
          <ringGeometry
            args={[Math.max(item.width, item.height) * 0.62, Math.max(item.width, item.height) * 0.7, 48]}
          />
          <meshBasicMaterial color={selected ? '#0f172a' : '#64748b'} transparent opacity={0.9} />
        </mesh>
      )}

      <Billboard position={[0, hullH + 46, 0]}>
        <Text
          fontSize={26}
          color="#0f172a"
          anchorX="center"
          anchorY="middle"
          outlineWidth={1.2}
          outlineColor="#ffffff"
        >
          {item.name}
        </Text>
      </Billboard>
    </group>
  )
}

/** Extruded boat hull with a pointed bow (towards +X) and rounded stern. */
function Boat({
  length,
  beam,
  height,
  color,
}: {
  length: number
  beam: number
  height: number
  color: string
}) {
  const geo = useMemo(() => {
    const L = length
    const hw = beam / 2
    const r = beam * 0.28
    const s = new THREE.Shape()
    s.moveTo(-L / 2 + r, -hw)
    s.lineTo(L * 0.18, -hw)
    s.quadraticCurveTo(L / 2, -hw * 0.55, L / 2, 0) // bow tip
    s.quadraticCurveTo(L / 2, hw * 0.55, L * 0.18, hw)
    s.lineTo(-L / 2 + r, hw)
    s.quadraticCurveTo(-L / 2, hw, -L / 2, hw - r)
    s.lineTo(-L / 2, -hw + r)
    s.quadraticCurveTo(-L / 2, -hw, -L / 2 + r, -hw)
    const g = new THREE.ExtrudeGeometry(s, {
      depth: height,
      bevelEnabled: true,
      bevelThickness: height * 0.25,
      bevelSize: beam * 0.06,
      bevelSegments: 2,
      steps: 1,
    })
    g.rotateX(-Math.PI / 2)
    g.computeVertexNormals()
    return g
  }, [length, beam, height])

  return (
    <group>
      <mesh geometry={geo} castShadow receiveShadow>
        <meshStandardMaterial color={color} roughness={0.55} metalness={0.05} />
      </mesh>
      {/* Cabin / windscreen towards the stern. */}
      <RoundedBox
        args={[length * 0.34, height * 0.9, beam * 0.62]}
        radius={Math.min(beam, height) * 0.12}
        smoothness={3}
        position={[-length * 0.08, height * 1.05, 0]}
        castShadow
      >
        <meshStandardMaterial color="#f8fafc" roughness={0.4} />
      </RoundedBox>
    </group>
  )
}

/** Simple vehicle / crate body for cars and pallets. */
function Vehicle({
  length,
  width,
  height,
  color,
}: {
  length: number
  width: number
  height: number
  color: string
}) {
  return (
    <group>
      <RoundedBox
        args={[length, height, width]}
        radius={Math.min(width, height) * 0.18}
        smoothness={3}
        position={[0, height / 2, 0]}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial color={color} roughness={0.5} metalness={0.05} />
      </RoundedBox>
      <RoundedBox
        args={[length * 0.5, height * 0.8, width * 0.82]}
        radius={Math.min(width, height) * 0.12}
        smoothness={3}
        position={[length * 0.02, height * 1.25, 0]}
        castShadow
      >
        <meshStandardMaterial color="#e2e8f0" roughness={0.4} />
      </RoundedBox>
    </group>
  )
}

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v))
}
