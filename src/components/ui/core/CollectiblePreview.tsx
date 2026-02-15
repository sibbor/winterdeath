
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
    const [isReady, setIsReady] = useState(false); // Deferred loading state

    // Visibility tracking
    useEffect(() => {
        if (!containerRef.current) return;
        const observer = new IntersectionObserver(
            ([entry]) => setIsVisible(entry.isIntersecting),
            { threshold: 0.1 }
        );
        observer.observe(containerRef.current);
        return () => observer.disconnect();
    }, []);

    // Deferred Loading Trigger
    useEffect(() => {
        if (isVisible && !isLocked) {
            // Small delay to let the UI slide-in animation finish (or at least start smoothly)
            // preventing the main thread freeze from blocking the CSS transition.
            const timer = setTimeout(() => setIsReady(true), 150);
            return () => clearTimeout(timer);
        }
    }, [isVisible, isLocked]);

    // Scene initialization
    useEffect(() => {
        if (!isReady || isLocked || !containerRef.current) return;

        const container = containerRef.current;
        const width = container.clientWidth;
        const height = container.clientHeight;

        const scene = new THREE.Scene();
        // Fix clipping: Set near plane to 0.01 and move camera slightly back if needed
        const camera = new THREE.PerspectiveCamera(45, width / height, 0.01, 100);
        camera.position.set(0, 0.8, 1.8);
        camera.lookAt(0, 0, 0);

        // Instance Low-Power Renderer
        const renderer = new THREE.WebGLRenderer({
            antialias: true,
            alpha: true,
            powerPreference: 'low-power',
            precision: 'mediump'
        });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.setSize(width, height);
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

        // Remove glow for UI
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

            // Cleanup SCENE and RENDERER
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
                // Placeholder during deferred load prevents "pop"
                <div className="text-[10px] font-mono text-zinc-700 uppercase animate-pulse">
                    Scanning...
                </div>
            ) : null}
        </div>
    );
};

export default CollectiblePreview;
