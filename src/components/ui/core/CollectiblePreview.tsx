import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { ModelFactory } from '../../../utils/assets';

interface CollectiblePreviewProps {
    type: string;
    isLocked?: boolean;
}

/**
 * [VINTERDÖD] Optimization: Static disposal function to avoid 
 * allocation of anonymous functions during cleanup.
 */
const disposeNode = (node: THREE.Object3D) => {
    if (!(node instanceof THREE.Mesh)) return;

    if (node.geometry) {
        node.geometry.dispose();
    }

    if (node.material) {
        if (Array.isArray(node.material)) {
            for (let i = 0; i < node.material.length; i++) {
                const mat = node.material[i];
                disposeMaterialTextures(mat);
                mat.dispose();
            }
        } else {
            disposeMaterialTextures(node.material);
            node.material.dispose();
        }
    }
};

/**
 * [VINTERDÖD] Helper to ensure all GPU textures are freed.
 */
const disposeMaterialTextures = (material: THREE.Material) => {
    // Explicitly check common texture slots to avoid GC from Object.values/keys
    const m = material as any;
    if (m.map) m.map.dispose();
    if (m.lightMap) m.lightMap.dispose();
    if (m.bumpMap) m.bumpMap.dispose();
    if (m.normalMap) m.normalMap.dispose();
    if (m.specularMap) m.specularMap.dispose();
    if (m.envMap) m.envMap.dispose();
};

const CollectiblePreview: React.FC<CollectiblePreviewProps> = ({ type, isLocked }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [isVisible, setIsVisible] = useState(false);
    const [isReady, setIsReady] = useState(false);

    useEffect(() => {
        if (!containerRef.current) return;
        const observer = new IntersectionObserver(
            ([entry]) => setIsVisible(entry.isIntersecting),
            { threshold: 0.1 }
        );
        observer.observe(containerRef.current);
        return () => observer.disconnect();
    }, []);

    useEffect(() => {
        if (isVisible && !isLocked) {
            const timer = setTimeout(() => setIsReady(true), 150);
            return () => clearTimeout(timer);
        }
    }, [isVisible, isLocked]);

    useEffect(() => {
        if (!isReady || isLocked || !containerRef.current) return;

        const container = containerRef.current;
        const width = container.clientWidth;
        const height = container.clientHeight;

        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(45, width / height, 0.01, 100);
        camera.position.set(0, 0.8, 1.8);
        camera.lookAt(0, 0, 0);

        const renderer = new THREE.WebGLRenderer({
            antialias: true,
            alpha: true,
            powerPreference: 'low-power',
            precision: 'mediump'
        });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.setSize(width, height);
        container.appendChild(renderer.domElement);

        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        scene.add(ambientLight);

        const dirLight = new THREE.DirectionalLight(0xffffff, 1.0);
        dirLight.position.set(2, 2, 2);
        scene.add(dirLight);

        const group = new THREE.Group();
        const originalMesh = ModelFactory.createCollectible(type);
        const mesh = originalMesh.clone();

        // Optimized cloning: Avoid .map() to keep memory flat
        mesh.traverse((child: any) => {
            if (child.isMesh && child.material) {
                if (Array.isArray(child.material)) {
                    const mats = child.material;
                    const newMats = new Array(mats.length);
                    for (let i = 0; i < mats.length; i++) {
                        newMats[i] = mats[i].clone();
                    }
                    child.material = newMats;
                } else {
                    child.material = child.material.clone();
                }
            }
        });

        const worldLight = mesh.getObjectByName('collectibleGlow');
        if (worldLight) mesh.remove(worldLight);

        group.add(mesh);
        scene.add(group);

        let animeId: number;
        let isRunning = true;

        const animate = () => {
            if (!isRunning) return;
            animeId = requestAnimationFrame(animate);
            group.rotation.y += 0.01;
            renderer.render(scene, camera);
        };
        animate();

        return () => {
            isRunning = false;
            cancelAnimationFrame(animeId);

            // Using our static, non-allocating cleanup logic
            mesh.traverse(disposeNode);

            scene.clear();
            renderer.dispose();
            renderer.forceContextLoss();

            if (container.contains(renderer.domElement)) {
                container.removeChild(renderer.domElement);
            }
        };
    }, [type, isLocked, isReady]);

    return (
        <div ref={containerRef} className="w-full h-full relative bg-black/20 flex items-center justify-center overflow-hidden">
            {isLocked ? (
                <div className="flex flex-col items-center justify-center gap-2 opacity-30 select-none">
                    <span className="text-zinc-600 text-6xl font-black">?</span>
                    <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">{type}</span>
                </div>
            ) : !isReady ? (
                <div className="text-[10px] font-mono text-zinc-700 uppercase animate-pulse">
                    Scanning...
                </div>
            ) : null}
        </div>
    );
};

export default CollectiblePreview;