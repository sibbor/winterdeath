import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { ModelFactory } from '../../../utils/assets';
import { t } from '../../../utils/i18n';

interface CollectiblePreviewProps {
    type: string;
    isLocked?: boolean;
    autoReady?: boolean;
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

// --- HELPER: Generate a simple Environment Map for reflections ---
const createEnvMap = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 256;
    const context = canvas.getContext('2d');
    if (context) {
        // Create a simple gradient to simulate a sky/ground environment
        const gradient = context.createLinearGradient(0, 0, 0, 256);
        gradient.addColorStop(0, '#555566'); // "Sky"
        gradient.addColorStop(0.5, '#ffffff'); // "Horizon line" (bright reflection)
        gradient.addColorStop(1, '#222222'); // "Ground"
        context.fillStyle = gradient;
        context.fillRect(0, 0, 512, 256);
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.mapping = THREE.EquirectangularReflectionMapping;
    return texture;
};

const envMapTexture = createEnvMap();

const CollectiblePreview: React.FC<CollectiblePreviewProps> = ({ type, isLocked, autoReady }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [isVisible, setIsVisible] = useState(autoReady || false);
    const [isReady, setIsReady] = useState(autoReady || false);

    // [VINTERDÖD] Optimization: Use refs for THREE objects to ensure they are 
    // preserved during visibility changes but disposed of correctly on unmount.
    const [size, setSize] = useState({ width: 0, height: 0 });
    const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
    const sceneRef = useRef<THREE.Scene | null>(null);
    const meshRef = useRef<THREE.Object3D | null>(null);
    const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
    const groupRef = useRef<THREE.Group | null>(null);

    useEffect(() => {
        if (!containerRef.current || autoReady) return;
        const observer = new IntersectionObserver(
            ([entry]) => setIsVisible(entry.isIntersecting),
            { threshold: 0.1 }
        );
        observer.observe(containerRef.current);
        return () => observer.disconnect();
    }, [autoReady]);

    useEffect(() => {
        if (!containerRef.current) return;

        const container = containerRef.current;
        const observer = new ResizeObserver((entries) => {
            if (!entries.length) return;
            const { width, height } = entries[0].contentRect;
            // Only update if size is valid to avoid redundant renders of 0x0
            if (width > 0 && height > 0) {
                setSize({ width, height });
            }
        });

        observer.observe(container);
        return () => observer.disconnect();
    }, []);

    useEffect(() => {
        if (autoReady || !isVisible || isLocked) return;
        const timer = setTimeout(() => setIsReady(true), 150);
        return () => clearTimeout(timer);
    }, [isVisible, isLocked, autoReady]);

    // --- THREE.js INITIALIZATION (SKAPAS BARA EN GÅNG) ---
    useEffect(() => {
        if (!isReady || isLocked || !containerRef.current) return;

        const container = containerRef.current;

        // Fallback om size inte hunnit sättas av ResizeObserver än
        const width = size.width > 0 ? size.width : container.clientWidth || 100;
        const height = size.height > 0 ? size.height : container.clientHeight || 100;

        const scene = new THREE.Scene();
        // Sätt EnvMap på scenen så att allt reflekterande material plockar upp den
        scene.environment = envMapTexture;

        const camera = new THREE.PerspectiveCamera(45, width / height, 0.01, 100);

        // --- VINTERDÖD FIX: Kamerans placering ---
        // Sänkte kameran på Y-axeln för att titta mer "rakt på" objektet istället för mycket ovanifrån.
        camera.position.set(0, 0.1, 1.4);
        camera.lookAt(0, 0, 0);

        const renderer = new THREE.WebGLRenderer({
            antialias: true,
            alpha: true, // Transparent bakgrund så TacticalCard lyser igenom
            powerPreference: 'high-performance',
            precision: 'mediump'
        });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.setSize(width, height);
        container.appendChild(renderer.domElement);

        // --- VINTERDÖD FIX: Belysning ---
        // Mer dramatisk ljussättning för att framhäva normal-maps och speglingar
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.4); // Lite mörkare ambient
        scene.add(ambientLight);

        // Huvudljus snett framifrån
        const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
        dirLight.position.set(2, 2, 2);
        scene.add(dirLight);

        // Ett "rim light" snett bakifrån för att separera mörka objekt från bakgrunden
        const backLight = new THREE.DirectionalLight(0xaaccff, 0.8);
        backLight.position.set(-2, 1, -2);
        scene.add(backLight);

        const group = new THREE.Group();
        const originalMesh = ModelFactory.createCollectible(type);
        const mesh = originalMesh.clone();

        mesh.traverse((child: any) => {
            if (child.isMesh && child.material) {
                if (Array.isArray(child.material)) {
                    const mats = child.material;
                    const newMats = new Array(mats.length);
                    for (let i = 0; i < mats.length; i++) {
                        newMats[i] = mats[i].clone();
                        // Tvinga materialet att uppdateras om det behöver miljö-reflektioner
                        newMats[i].needsUpdate = true;
                    }
                    child.material = newMats;
                } else {
                    child.material = child.material.clone();
                    child.material.needsUpdate = true;
                }
            }
        });

        const worldLight = mesh.getObjectByName('collectibleGlow');
        if (worldLight) mesh.remove(worldLight);

        // --- VINTERDÖD FIX: Auto-Scale & Auto-Center ---
        // Räkna ut hur stor originalmodellen är
        const box = new THREE.Box3().setFromObject(mesh);
        const sizeObj = box.getSize(new THREE.Vector3());

        // Hitta den största ledden (X, Y eller Z) och skala upp/ner till exakt 0.9 enheter
        // (Sänkt från 1.2 till 0.9 så att objektet "vilar" lite bättre i rutan)
        const maxDim = Math.max(sizeObj.x, sizeObj.y, sizeObj.z);
        if (maxDim > 0) {
            const scaleFactor = 0.9 / maxDim;
            mesh.scale.setScalar(scaleFactor);
        }

        // Efter skalning: Hitta den nya mitten och flytta meshen så att dess mittpunkt är exakt i origo (0,0,0)
        const scaledBox = new THREE.Box3().setFromObject(mesh);
        const center = scaledBox.getCenter(new THREE.Vector3());
        mesh.position.sub(center);

        // En "Fusk-skugga" under objektet för att grunda det.
        const shadowGeo = new THREE.PlaneGeometry(1, 1);
        const shadowMat = new THREE.MeshBasicMaterial({
            color: 0x000000,
            transparent: true,
            opacity: 0.4,
            depthWrite: false
        });

        // Skapa en enkel radiell gradient för skuggan
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 128;
        const ctx = canvas.getContext('2d');
        if (ctx) {
            const grd = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
            grd.addColorStop(0, 'rgba(0,0,0,1)');
            grd.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = grd;
            ctx.fillRect(0, 0, 128, 128);
            shadowMat.map = new THREE.CanvasTexture(canvas);
        }

        const dropShadow = new THREE.Mesh(shadowGeo, shadowMat);
        dropShadow.rotation.x = -Math.PI / 2;
        // Placera skuggan precis under objektets bounding box botten
        dropShadow.position.y = -0.5;
        scene.add(dropShadow);
        // -----------------------------------------------

        group.add(mesh);
        scene.add(group);

        rendererRef.current = renderer;
        sceneRef.current = scene;
        meshRef.current = mesh;
        cameraRef.current = camera;
        groupRef.current = group;

        return () => {
            mesh.traverse(disposeNode);
            dropShadow.geometry.dispose();
            disposeMaterialTextures(dropShadow.material);
            (dropShadow.material as THREE.Material).dispose();
            scene.clear();
            renderer.dispose();
            renderer.forceContextLoss();
            if (container.contains(renderer.domElement)) {
                container.removeChild(renderer.domElement);
            }
            rendererRef.current = null;
            sceneRef.current = null;
            meshRef.current = null;
            cameraRef.current = null;
            groupRef.current = null;
        };
        // VINTERDÖD FIX: 'size' borttagen från deps. Vi återskapar INTE hela scenen vid resize.
    }, [type, isLocked, isReady]);

    // --- ZERO-GC RESIZE HANDLER ---
    useEffect(() => {
        if (rendererRef.current && cameraRef.current && size.width > 0 && size.height > 0) {
            rendererRef.current.setSize(size.width, size.height);
            cameraRef.current.aspect = size.width / size.height;
            cameraRef.current.updateProjectionMatrix();
        }
    }, [size]);

    // --- ANIMATION LOOP ---
    useEffect(() => {
        const renderer = rendererRef.current;
        const scene = sceneRef.current;
        const group = groupRef.current;
        const camera = cameraRef.current;

        if (!renderer || !scene || !group || !camera || !isVisible) return;

        let animeId: number;
        const animate = () => {
            animeId = requestAnimationFrame(animate);
            // Tillbaka till autorotation som i originalkoden!
            group.rotation.y += 0.015; // Lite långsammare snurr, ser mer "premium" ut
            renderer.render(scene, camera);
        };

        animate();
        return () => cancelAnimationFrame(animeId);
    }, [isVisible, isReady]);

    return (
        <div ref={containerRef} className="w-full h-full relative flex items-center justify-center overflow-hidden">
            {isLocked ? (
                <div className="flex flex-col items-center justify-center gap-2 opacity-30 select-none">
                    <span className="text-zinc-600 text-6xl font-black">?</span>
                    <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">{type}</span>
                </div>
            ) : !isReady ? (
                <div className="text-[10px] font-mono text-zinc-700 uppercase animate-pulse">
                    {t('ui.scanning')}
                </div>
            ) : null}
        </div>
    );
};

export default CollectiblePreview;