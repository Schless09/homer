"use client";

import { Component, Suspense, useMemo, type ReactNode } from "react";
import * as THREE from "three";
import { useGLTF } from "@react-three/drei";

/**
 * A retailer-supplied GLB/GLTF model, fitted to the listed dimensions (the
 * catalog's dimensions are the source of truth). glTF faces +Z, which matches
 * our convention of the front facing +z. Falls back on load errors.
 */
function Fitted({ url, w, d, h }: { url: string; w: number; d: number; h: number }) {
  const { scene } = useGLTF(url);
  const obj = useMemo(() => {
    const root = scene.clone(true);
    root.traverse((m) => {
      if ((m as THREE.Mesh).isMesh) {
        m.castShadow = true;
        m.receiveShadow = true;
      }
    });
    const size = new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3());
    root.scale.set(w / Math.max(size.x, 1e-6), h / Math.max(size.y, 1e-6), d / Math.max(size.z, 1e-6));
    root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(root);
    const center = box.getCenter(new THREE.Vector3());
    root.position.set(-center.x, -box.min.y, -center.z);
    const group = new THREE.Group();
    group.add(root);
    return group;
  }, [scene, w, d, h]);
  return <primitive object={obj} />;
}

class Fallback extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(err: unknown) {
    console.warn("[3D] product model failed to load, using procedural model", err);
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export function ProductModel({ url, w, d, h, fallback }: { url: string; w: number; d: number; h: number; fallback: ReactNode }) {
  return (
    <Fallback fallback={fallback}>
      <Suspense fallback={fallback}>
        <Fitted url={url} w={w} d={d} h={h} />
      </Suspense>
    </Fallback>
  );
}
