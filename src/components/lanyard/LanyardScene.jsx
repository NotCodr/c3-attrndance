/* eslint-disable react/no-unknown-property */
import React, { Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { Canvas, extend, useFrame, useThree } from '@react-three/fiber';
import { Environment, Lightformer, RoundedBox } from '@react-three/drei';
import { BallCollider, CuboidCollider, Physics, RigidBody, useRopeJoint, useSphericalJoint } from '@react-three/rapier';
import { MeshLineGeometry, MeshLineMaterial } from 'meshline';
import { ANCHOR_Y, CLIP_DROP, framing, PAPER_WIDTH, planeSize, ROPE } from '@/components/lanyard/layout';

extend({ MeshLineGeometry, MeshLineMaterial });

// The rope, joints, damping and drag below are React Bits' Lanyard. What
// hangs from it is the printed slip: a slim satin strap through a silver ring,
// and a small clamp over the top edge of the paper.
const STRAP_WIDTH = 0.58;
const STRAP_REPEATS = 5;
const noRaycast = () => null;

/**
 * `art` is the slip from useReceiptArt (both faces and its size), `strap` the
 * strap's canvas. The chain starts at rest, as the printer leaves it; each
 * change of `swing` gives it a push. `onTap` fires for a press that didn't drag.
 */
export default function LanyardScene({ art, strap, swing = 0, onTap, onReady, active = true, gravity = [0, -40, 0] }) {
  const wrapper = useRef(null);
  const grabbing = useRef(false);
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // A touch that lands on the paper drags it instead of scrolling the page;
  // anywhere else on the stage still scrolls. Pointer events are dispatched
  // before touch events, so the paper has claimed the touch by this point.
  useEffect(() => {
    const el = wrapper.current;
    if (!el) return undefined;
    const block = (e) => { if (grabbing.current && e.cancelable) e.preventDefault(); };
    el.addEventListener('touchstart', block, { passive: false });
    el.addEventListener('touchmove', block, { passive: false });
    return () => {
      el.removeEventListener('touchstart', block);
      el.removeEventListener('touchmove', block);
    };
  }, []);

  const plane = planeSize(art);

  return (
    <div ref={wrapper} className="absolute inset-0">
      <Canvas
        frameloop={active ? 'always' : 'never'}
        camera={{ position: [0, 0, 20], rotation: [0, 0, 0], fov: 20 }}
        dpr={[1, isMobile ? 1.5 : 2]}
        gl={{ alpha: true }}
        onCreated={({ gl }) => gl.setClearColor(new THREE.Color(0x000000), 0)}
      >
        <Framing paperHeight={plane.height} />
        <ambientLight intensity={Math.PI} />
        <Suspense fallback={null}>
          <Physics gravity={gravity} timeStep={isMobile ? 1 / 30 : 1 / 60}>
            {/* A slip of a different length needs its joint re-made. */}
            <Band
              key={plane.height.toFixed(3)}
              art={art}
              strap={strap}
              plane={plane}
              swing={swing}
              isMobile={isMobile}
              grabbing={grabbing}
              onTap={onTap}
              onReady={onReady}
            />
          </Physics>
        </Suspense>
        <Environment blur={0.75}>
          <Lightformer intensity={2} color="white" position={[0, -1, 5]} rotation={[0, 0, Math.PI / 3]} scale={[100, 0.1, 1]} />
          <Lightformer intensity={3} color="white" position={[-1, -1, 1]} rotation={[0, 0, Math.PI / 3]} scale={[100, 0.1, 1]} />
          <Lightformer intensity={3} color="white" position={[1, 1, 1]} rotation={[0, 0, Math.PI / 3]} scale={[100, 0.1, 1]} />
          <Lightformer intensity={10} color="white" position={[-10, 0, 14]} rotation={[0, Math.PI / 2, Math.PI / 3]} scale={[100, 10, 1]} />
        </Environment>
      </Canvas>
    </div>
  );
}

/** Points the camera the way the printer overlay expects (see layout.js). */
function Framing({ paperHeight }) {
  const { camera, size } = useThree();
  useLayoutEffect(() => {
    const frame = framing(size.width, size.height, paperHeight);
    camera.position.set(0, frame.cameraY, frame.cameraZ);
    camera.rotation.set(0, 0, 0);
    camera.updateProjectionMatrix();
  }, [camera, size.width, size.height, paperHeight]);
  return null;
}

function useCanvasTexture(canvas, repeat = false) {
  const texture = useMemo(() => {
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.needsUpdate = true;
    return t;
  }, [canvas, repeat]);
  useEffect(() => () => texture.dispose(), [texture]);
  return texture;
}

function Band({ art, strap, plane, swing, isMobile, grabbing, onTap, onReady, maxSpeed = 50, minSpeed = 0 }) {
  const band = useRef(), fixed = useRef(), j1 = useRef(), j2 = useRef(), j3 = useRef(), card = useRef();
  const vec = new THREE.Vector3(), ang = new THREE.Vector3(), rot = new THREE.Vector3(), dir = new THREE.Vector3();
  const facing = new THREE.Vector3(), turn = new THREE.Quaternion();
  const frontMaterial = useRef(), backMaterial = useRef();
  const segmentProps = { type: 'dynamic', canSleep: true, colliders: false, angularDamping: 4, linearDamping: 4 };
  const frontTexture = useCanvasTexture(art.front);
  const backTexture = useCanvasTexture(art.back);
  const strapTexture = useCanvasTexture(strap, true);
  const halfHeight = plane.height / 2;
  const ring = halfHeight + CLIP_DROP;

  const [curve] = useState(
    () => new THREE.CatmullRomCurve3([new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()]),
  );
  const [dragged, drag] = useState(false);
  const [hovered, hover] = useState(false);
  const press = useRef(null);
  const ready = useRef(false);

  useRopeJoint(fixed, j1, [[0, 0, 0], [0, 0, 0], 1]);
  useRopeJoint(j1, j2, [[0, 0, 0], [0, 0, 0], 1]);
  useRopeJoint(j2, j3, [[0, 0, 0], [0, 0, 0], 1]);
  useSphericalJoint(j3, card, [[0, 0, 0], [0, ring, 0]]);

  useEffect(() => {
    if (hovered) {
      document.body.style.cursor = dragged ? 'grabbing' : 'grab';
      return () => void (document.body.style.cursor = 'auto');
    }
    return undefined;
  }, [hovered, dragged]);

  // The printer lets go: a push to set it swinging.
  useEffect(() => {
    if (!swing || !card.current) return;
    [card, j1, j2, j3].forEach((ref) => ref.current?.wakeUp());
    card.current.applyImpulse({ x: 0.45, y: 0, z: 0 }, true);
    card.current.applyTorqueImpulse({ x: 0, y: 0.025, z: 0 }, true);
  }, [swing]);

  useFrame((state, delta) => {
    if (!ready.current) {
      ready.current = true;
      onReady?.();
    }
    if (dragged) {
      vec.set(state.pointer.x, state.pointer.y, 0.5).unproject(state.camera);
      dir.copy(vec).sub(state.camera.position).normalize();
      // Where the pointer's ray meets the plane the slip hangs in. (React Bits
      // steps out by the camera's distance, which assumes it sits level with
      // the origin; this camera is raised to frame the slip.)
      vec.copy(state.camera.position).add(dir.multiplyScalar(-state.camera.position.z / dir.z));
      [card, j1, j2, j3, fixed].forEach((ref) => ref.current?.wakeUp());
      card.current?.setNextKinematicTranslation({ x: vec.x - dragged.x, y: vec.y - dragged.y, z: vec.z - dragged.z });
    }
    if (fixed.current) {
      [j1, j2].forEach((ref) => {
        if (!ref.current.lerped) ref.current.lerped = new THREE.Vector3().copy(ref.current.translation());
        const clampedDistance = Math.max(0.1, Math.min(1, ref.current.lerped.distanceTo(ref.current.translation())));
        ref.current.lerped.lerp(ref.current.translation(), delta * (minSpeed + clampedDistance * (maxSpeed - minSpeed)));
      });
      curve.points[0].copy(j3.current.translation());
      curve.points[1].copy(j2.current.lerped);
      curve.points[2].copy(j1.current.lerped);
      curve.points[3].copy(fixed.current.translation());
      band.current.geometry.setPoints(curve.getPoints(isMobile ? 16 : 32));
      ang.copy(card.current.angvel());
      rot.copy(card.current.rotation());
      card.current.setAngvel({ x: ang.x, y: ang.y - rot.y * 0.25, z: ang.z });

      // The paper is unlit so the print keeps its real colours; instead it
      // dims a little as it turns away from the viewer.
      const q = card.current.rotation();
      facing.set(0, 0, 1).applyQuaternion(turn.set(q.x, q.y, q.z, q.w));
      const light = 0.8 + 0.2 * Math.abs(facing.z);
      frontMaterial.current?.color.setScalar(light);
      backMaterial.current?.color.setScalar(light * 0.94);
    }
  });

  curve.curveType = 'chordal';

  const release = (e) => {
    e.target.releasePointerCapture?.(e.pointerId);
    grabbing.current = false;
    drag(false);
  };

  return (
    <>
      {/* Hung straight down and at rest, exactly where the printer drops the slip. */}
      <group position={[0, ANCHOR_Y, 0]}>
        <RigidBody ref={fixed} {...segmentProps} type="fixed" />
        <RigidBody position={[0, -1, 0]} ref={j1} {...segmentProps}>
          <BallCollider args={[0.1]} />
        </RigidBody>
        <RigidBody position={[0, -2, 0]} ref={j2} {...segmentProps}>
          <BallCollider args={[0.1]} />
        </RigidBody>
        <RigidBody position={[0, -ROPE, 0]} ref={j3} {...segmentProps}>
          <BallCollider args={[0.1]} />
        </RigidBody>
        <RigidBody position={[0, -ROPE - ring, 0]} ref={card} {...segmentProps} type={dragged ? 'kinematicPosition' : 'dynamic'}>
          <CuboidCollider args={[PAPER_WIDTH / 2, halfHeight, 0.01]} />
          <group
            onPointerOver={() => hover(true)}
            onPointerOut={() => hover(false)}
            onPointerDown={(e) => {
              e.stopPropagation();
              e.target.setPointerCapture(e.pointerId);
              grabbing.current = true;
              press.current = { x: e.clientX, y: e.clientY, at: performance.now() };
              drag(new THREE.Vector3().copy(e.point).sub(vec.copy(card.current.translation())));
            }}
            onPointerUp={(e) => {
              release(e);
              const p = press.current;
              press.current = null;
              if (p && Math.hypot(e.clientX - p.x, e.clientY - p.y) < 8 && performance.now() - p.at < 350) onTap?.();
            }}
            onPointerCancel={(e) => {
              press.current = null;
              release(e);
            }}
          >
            {/* What the pointer grabs: the paper and clamp, not the seal's margins. */}
            <mesh position={[0, CLIP_DROP / 2, 0]}>
              <planeGeometry args={[PAPER_WIDTH, plane.height + CLIP_DROP]} />
              <meshBasicMaterial transparent opacity={0} depthWrite={false} />
            </mesh>
            <mesh position={[0, 0, 0.002]} raycast={noRaycast}>
              <planeGeometry args={[plane.width, plane.height]} />
              <meshBasicMaterial ref={frontMaterial} map={frontTexture} alphaTest={0.5} toneMapped={false} />
            </mesh>
            <mesh position={[0, 0, -0.002]} rotation={[0, Math.PI, 0]} raycast={noRaycast}>
              <planeGeometry args={[plane.width, plane.height]} />
              <meshBasicMaterial ref={backMaterial} map={backTexture} alphaTest={0.5} toneMapped={false} />
            </mesh>
            <Clip top={halfHeight} />
          </group>
        </RigidBody>
      </group>
      <mesh ref={band} raycast={noRaycast}>
        <meshLineGeometry />
        <meshLineMaterial
          color="white"
          depthTest={false}
          resolution={isMobile ? [1000, 2000] : [1000, 1000]}
          useMap
          map={strapTexture}
          repeat={[-STRAP_REPEATS, 1]}
          lineWidth={STRAP_WIDTH}
        />
      </mesh>
    </>
  );
}

/** A silver ring for the strap and a slim gunmetal clamp over the paper's top edge. */
function Clip({ top }) {
  return (
    <group position={[0, top, 0]}>
      <mesh position={[0, CLIP_DROP, 0]} raycast={noRaycast}>
        <torusGeometry args={[0.05, 0.012, 12, 32]} />
        <meshStandardMaterial color="#dfe2e8" metalness={1} roughness={0.22} />
      </mesh>
      <RoundedBox args={[0.034, 0.05, 0.02]} radius={0.008} smoothness={2} position={[0, 0.088, 0]} raycast={noRaycast}>
        <meshStandardMaterial color="#c9ccd3" metalness={1} roughness={0.25} />
      </RoundedBox>
      <RoundedBox args={[0.21, 0.1, 0.036]} radius={0.016} smoothness={3} position={[0, 0.022, 0.004]} raycast={noRaycast}>
        <meshStandardMaterial color="#2a2b31" metalness={0.9} roughness={0.3} />
      </RoundedBox>
      <mesh position={[0, 0.022, 0.024]} rotation={[Math.PI / 2, 0, 0]} raycast={noRaycast}>
        <cylinderGeometry args={[0.013, 0.013, 0.008, 20]} />
        <meshStandardMaterial color="#dfe2e8" metalness={1} roughness={0.2} />
      </mesh>
    </group>
  );
}
