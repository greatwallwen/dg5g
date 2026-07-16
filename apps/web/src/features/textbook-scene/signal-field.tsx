'use client';

import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';

export function SignalField({ motionEnabled, reading }: { motionEnabled: boolean; reading: boolean }) {
  const fieldRef = useRef<THREE.Group>(null);
  const pulseRef = useRef<THREE.Mesh>(null);
  const geometry = useMemo(() => buildSignalGeometry(), []);

  useFrame(({ clock }) => {
    if (!motionEnabled) return;
    const elapsed = clock.getElapsedTime();
    if (fieldRef.current) {
      fieldRef.current.rotation.z = elapsed * (reading ? 0.012 : 0.035);
      fieldRef.current.rotation.y = Math.sin(elapsed * 0.12) * 0.08;
    }
    if (pulseRef.current) {
      const scale = 1 + Math.sin(elapsed * 1.8) * (reading ? 0.025 : 0.07);
      pulseRef.current.scale.setScalar(scale);
    }
  });

  return (
    <group ref={fieldRef} position={[0, 0, -8]}>
      <lineSegments geometry={geometry.lines}>
        <lineBasicMaterial color="#2075dd" transparent opacity={reading ? 0.08 : 0.16} />
      </lineSegments>
      <points geometry={geometry.points}>
        <pointsMaterial color="#53e4e1" size={reading ? 0.035 : 0.055} transparent opacity={reading ? 0.35 : 0.78} sizeAttenuation />
      </points>
      <mesh ref={pulseRef} rotation={[0, 0, 0]}>
        <torusGeometry args={[2.7, 0.018, 8, 96]} />
        <meshBasicMaterial color="#22d3c5" transparent opacity={reading ? 0.08 : 0.24} />
      </mesh>
      <mesh rotation={[0, 0, Math.PI / 3]}>
        <torusGeometry args={[4.4, 0.012, 8, 96]} />
        <meshBasicMaterial color="#f2aa4c" transparent opacity={reading ? 0.05 : 0.18} />
      </mesh>
    </group>
  );
}

function buildSignalGeometry() {
  const pointValues: number[] = [];
  const lineValues: number[] = [];
  for (let ringIndex = 0; ringIndex < 3; ringIndex += 1) {
    const count = 12 + ringIndex * 4;
    const radius = 1.8 + ringIndex * 1.15;
    const ring: THREE.Vector3[] = [];
    for (let index = 0; index < count; index += 1) {
      const angle = (index / count) * Math.PI * 2 + ringIndex * 0.22;
      const point = new THREE.Vector3(Math.cos(angle) * radius, Math.sin(angle) * radius * 0.62, -0.5 + ringIndex * 0.32);
      ring.push(point);
      pointValues.push(point.x, point.y, point.z);
    }
    ring.forEach((point, index) => {
      const next = ring[(index + 1) % ring.length];
      lineValues.push(point.x, point.y, point.z, next.x, next.y, next.z);
    });
  }
  const pointGeometry = new THREE.BufferGeometry();
  pointGeometry.setAttribute('position', new THREE.Float32BufferAttribute(pointValues, 3));
  const lineGeometry = new THREE.BufferGeometry();
  lineGeometry.setAttribute('position', new THREE.Float32BufferAttribute(lineValues, 3));
  return { points: pointGeometry, lines: lineGeometry };
}
