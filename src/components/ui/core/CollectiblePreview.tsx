
import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { ModelFactory } from '../../../utils/assets';

interface CollectiblePreviewProps {
    type: string;
    isLocked?: boolean;
}

const CollectiblePreview: React.FC<CollectiblePreviewProps> = ({ type, isLocked }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [isVisible, setIsVisible] = useState(false);

    // Visibility tracking to lazy-load WebGL contexts
    useEffect(() => {
        if (!containerRef.current) return;

        const observer = new IntersectionObserver(
            ([entry]) => {
                setIsVisible(entry.isIntersecting);
            },
            { threshold: 0.1 }
        );

        observer.observe(containerRef.current);

        return () => {
            if (containerRef.current) {
                observer.unobserve(containerRef.current);
            }
            observer.disconnect();
        };
    }, []);

    // Scene initialization - Only for Unlocked & Visible items
    useEffect(() => {
        if (!isVisible || isLocked || !containerRef.current) return;

        const container = containerRef.current;
        const width = container.clientWidth;
        const height = container.clientHeight;

        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
        camera.position.set(0, 1, 3);
        camera.lookAt(0, 0, 0);

        const renderer = new THREE.WebGLRenderer({
            antialias: true,
            alpha: true,
            powerPreference: 'low-power' // Optimization
        });
        renderer.setSize(width, height);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // Limit pixel ratio
        container.appendChild(renderer.domElement);

        // Lighting
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        scene.add(ambientLight);

        const dirLight = new THREE.DirectionalLight(0xffffff, 1.0);
        dirLight.position.set(2, 2, 2);
        scene.add(dirLight);

        // Model
        const group = new THREE.Group();
        const mesh = ModelFactory.createCollectible(type);

        // Remove the world-space light if present to avoid over-exposure in UI
        const worldLight = mesh.getObjectByName('collectibleGlow');
        if (worldLight) mesh.remove(worldLight);

        group.add(mesh);
        scene.add(group);

        let animeId: number;
        const animate = () => {
            animeId = requestAnimationFrame(animate);
            group.rotation.y += 0.01;
            renderer.render(scene, camera);
        };
        animate();

        return () => {
            cancelAnimationFrame(animeId);

            // Thorough Cleanup
            scene.traverse((object) => {
                if (object instanceof THREE.Mesh) {
                    object.geometry.dispose();
                    if (Array.isArray(object.material)) {
                        object.material.forEach(m => m.dispose());
                    } else {
                        object.material.dispose();
                    }
                }
            });

            renderer.dispose();
            if (container.contains(renderer.domElement)) {
                container.removeChild(renderer.domElement);
            }
        };
    }, [type, isLocked, isVisible]);

    return (
        <div ref={containerRef} className="w-full h-full relative bg-black/20 flex items-center justify-center overflow-hidden">
            {isLocked ? (
                <div className="flex flex-col items-center justify-center gap-2 opacity-30 select-none">
                    <span className="text-zinc-600 text-6xl font-black">?</span>
                    <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">{type}</span>
                </div>
            ) : !isVisible ? (
                <div className="text-[10px] font-mono text-zinc-700 uppercase animate-pulse">
                    Loading Lens...
                </div>
            ) : null}
        </div>
    );
};

export default CollectiblePreview;
