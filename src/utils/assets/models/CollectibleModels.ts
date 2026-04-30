import * as THREE from 'three';
import { getSharedGlowTexture } from '../materials';

// --- PERFORMANCE CACHE (Zero-GC) ---
const cache: Record<string, any> = {};
// Cache för färdiga ihopsatta modeller (Prefabs)
const prefabCache: Record<string, THREE.Group> = {};

const getGeo = (key: string, create: () => THREE.BufferGeometry) => {
    if (!cache[key]) cache[key] = create();
    return cache[key];
};

const getMat = (key: string, create: () => THREE.Material) => {
    if (!cache[key]) cache[key] = create();
    return cache[key];
};

export const CollectibleModels = {
    createCollectible: (type: string): THREE.Group => {
        // If we've already built this type of model once, return a clone!
        if (prefabCache[type]) {
            const clone = prefabCache[type].clone();
            clone.userData = { type }; // Set userData on the clone
            return clone;
        }

        const group = new THREE.Group();
        group.userData = { type };

        switch (type) {
            case 'pacifier': {
                const colorSageGreen = 0x8a9a86;
                const colorNaturalRubber = 0xe0b976;

                const matGreen = getMat('pacifier_green', () => new THREE.MeshStandardMaterial({ color: colorSageGreen, roughness: 0.7 }));
                const matRubber = getMat('pacifier_rubber', () => new THREE.MeshStandardMaterial({ color: colorNaturalRubber, roughness: 0.3, transparent: true, opacity: 0.9 }));
                const matHole = getMat('pacifier_hole_mat', () => new THREE.MeshBasicMaterial({ color: 0x111111 }));

                const hub = new THREE.Mesh(getGeo('pacifier_hub', () => new THREE.CylinderGeometry(0.045, 0.045, 0.06, 16)), matGreen);
                hub.position.y = -0.01;
                group.add(hub);

                const shieldDome = new THREE.Mesh(getGeo('pacifier_dome', () => new THREE.CylinderGeometry(0.15, 0.11, 0.03, 24)), matGreen);
                shieldDome.position.y = 0.02;
                group.add(shieldDome);

                const shieldRim = new THREE.Mesh(getGeo('pacifier_rim', () => new THREE.TorusGeometry(0.145, 0.015, 8, 24)), matGreen);
                shieldRim.rotation.x = Math.PI / 2;
                shieldRim.position.y = 0.035;
                group.add(shieldRim);

                const holeGeo = getGeo('pacifier_hole', () => new THREE.CylinderGeometry(0.018, 0.018, 0.04, 8));
                for (let i = 0; i < 3; i++) {
                    const angle = (i * Math.PI * 2) / 3;
                    const hole = new THREE.Mesh(holeGeo, matHole);
                    hole.position.set(Math.cos(angle) * 0.09, 0.025, Math.sin(angle) * 0.09);
                    group.add(hole);
                }

                const ring = new THREE.Mesh(getGeo('pacifier_ring', () => new THREE.TorusGeometry(0.07, 0.018, 8, 16)), matGreen);
                ring.position.y = -0.04;
                group.add(ring);

                const nipplePoints = [
                    new THREE.Vector2(0.001, 0.0), new THREE.Vector2(0.028, 0.0), new THREE.Vector2(0.022, 0.05),
                    new THREE.Vector2(0.045, 0.12), new THREE.Vector2(0.040, 0.16), new THREE.Vector2(0.001, 0.18)
                ];
                const nipple = new THREE.Mesh(getGeo('pacifier_nipple_cherry', () => new THREE.LatheGeometry(nipplePoints, 16)), matRubber);
                nipple.position.y = 0.03;
                group.add(nipple);
                break;
            }

            case 'axe': {
                const matWood = getMat('axe_wood_mat', () => new THREE.MeshStandardMaterial({ color: 0x8b5a2b, roughness: 0.85 }));
                const matForged = getMat('axe_forged_mat', () => new THREE.MeshStandardMaterial({ color: 0x2b2b2c, metalness: 0.7, roughness: 0.7 }));
                const matEdge = getMat('axe_edge_mat', () => new THREE.MeshStandardMaterial({ color: 0xcdd2d6, metalness: 0.9, roughness: 0.2 }));

                const axeGroup = new THREE.Group();

                const handleShape = new THREE.Shape();
                handleShape.moveTo(-0.025, 0.55); handleShape.lineTo(0.025, 0.55); handleShape.lineTo(0.015, 0.1);
                handleShape.lineTo(0.04, -0.2); handleShape.lineTo(0.07, -0.45); handleShape.lineTo(0.0, -0.55);
                handleShape.lineTo(-0.05, -0.2); handleShape.lineTo(-0.015, 0.1);

                const handleExtrude = { depth: 0.04, bevelEnabled: true, bevelSegments: 2, steps: 1, bevelSize: 0.01, bevelThickness: 0.01 };
                const handleGeo = getGeo('axe_handle_centered', () => {
                    const geo = new THREE.ExtrudeGeometry(handleShape, handleExtrude);
                    geo.translate(0, 0, -0.02);
                    return geo;
                });
                const handle = new THREE.Mesh(handleGeo, matWood);
                axeGroup.add(handle);

                const headShape = new THREE.Shape();
                headShape.moveTo(-0.12, 0.08); headShape.lineTo(0.05, 0.08); headShape.lineTo(0.18, 0.12);
                headShape.lineTo(0.18, -0.22); headShape.lineTo(0.08, -0.1); headShape.lineTo(0.05, -0.08); headShape.lineTo(-0.12, -0.08);

                const headExtrude = { depth: 0.06, bevelEnabled: true, bevelSegments: 1, steps: 1, bevelSize: 0.005, bevelThickness: 0.005 };
                const headGeo = getGeo('axe_head_forged', () => {
                    const geo = new THREE.ExtrudeGeometry(headShape, headExtrude);
                    geo.translate(0, 0, -0.03);
                    return geo;
                });
                const head = new THREE.Mesh(headGeo, matForged);
                head.position.y = 0.45;
                axeGroup.add(head);

                const edgeShape = new THREE.Shape();
                edgeShape.moveTo(0.16, 0.115); edgeShape.lineTo(0.24, 0.13); edgeShape.lineTo(0.24, -0.24); edgeShape.lineTo(0.16, -0.20);

                const edgeExtrude = { depth: 0.02, bevelEnabled: true, bevelSegments: 1, steps: 1, bevelSize: 0.005, bevelThickness: 0.005 };
                const edgeGeo = getGeo('axe_edge_silver', () => {
                    const geo = new THREE.ExtrudeGeometry(edgeShape, edgeExtrude);
                    geo.translate(0, 0, -0.01);
                    return geo;
                });
                const edge = new THREE.Mesh(edgeGeo, matEdge);
                edge.position.y = 0.45;
                axeGroup.add(edge);

                group.add(axeGroup);
                break;
            }

            case 'badge': {
                const badgeGroup = new THREE.Group();

                const matGold = getMat('badge_gold_mat', () => new THREE.MeshStandardMaterial({ color: 0xffd700, metalness: 0.9, roughness: 0.1 }));
                const matBlue = getMat('badge_blue_mat', () => new THREE.MeshStandardMaterial({ color: 0x1e3f66, metalness: 0.1, roughness: 0.6 }));
                const matOffWhite = getMat('badge_white_basic', () => new THREE.MeshBasicMaterial({ color: 0xdddddd }));
                const matLeather = getMat('badge_leather', () => new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 }));

                const walletW = 0.9; const walletH = 1.15;

                const walletTop = new THREE.Mesh(getGeo('badge_wallet_top', () => new THREE.BoxGeometry(walletW, walletH, 0.04)), matLeather);
                badgeGroup.add(walletTop);

                const walletBottomGeo = getGeo('badge_wallet_bottom', () => {
                    const geo = new THREE.BoxGeometry(walletW, walletH, 0.03);
                    geo.translate(0, -walletH / 2, 0);
                    return geo;
                });
                const walletBottom = new THREE.Mesh(walletBottomGeo, matLeather);
                walletBottom.position.set(0, -walletH / 2, 0.015);
                walletBottom.rotation.x = -Math.PI / 3;
                badgeGroup.add(walletBottom);

                const idCard = new THREE.Mesh(getGeo('badge_id', () => new THREE.PlaneGeometry(0.7, 0.45)), matOffWhite);
                idCard.position.set(0, -walletH / 2, 0.016);
                idCard.rotation.z = Math.PI / 2;
                walletBottom.add(idCard);
                const idPhoto = new THREE.Mesh(getGeo('badge_id_photo', () => new THREE.PlaneGeometry(0.2, 0.25)), getMat('badge_id_blue', () => new THREE.MeshBasicMaterial({ color: 0x6699ff })));
                idPhoto.position.set(0.2, 0, 0.001);
                idCard.add(idPhoto);

                const shieldShape = new THREE.Shape();
                shieldShape.moveTo(0, 0.5); shieldShape.lineTo(-0.35, 0.35); shieldShape.lineTo(-0.4, -0.15);
                shieldShape.lineTo(0, -0.5); shieldShape.lineTo(0.4, -0.15); shieldShape.lineTo(0.35, 0.35); shieldShape.lineTo(0, 0.5);

                const badgeGeo = getGeo('badge_shield_geo', () => new THREE.ExtrudeGeometry(shieldShape, { depth: 0.02, bevelEnabled: false }));
                const shield = new THREE.Mesh(badgeGeo, matGold);
                shield.position.set(0, 0, 0.02);
                badgeGroup.add(shield);

                const inlay = new THREE.Mesh(badgeGeo, matBlue);
                inlay.scale.setScalar(0.85);
                inlay.position.set(0, 0, 0.035);
                badgeGroup.add(inlay);

                const topBar = new THREE.Mesh(getGeo('badge_banner_geo', () => new THREE.BoxGeometry(0.5, 0.12, 0.02)), matGold);
                topBar.position.set(0, 0.25, 0.04);
                badgeGroup.add(topBar);

                const seal = new THREE.Mesh(getGeo('badge_seal_geo', () => new THREE.CylinderGeometry(0.12, 0.12, 0.02, 16)), matOffWhite);
                seal.rotation.x = Math.PI / 2;
                seal.position.set(0, -0.05, 0.045);
                badgeGroup.add(seal);

                badgeGroup.position.y = 0.2;
                badgeGroup.rotation.x = -Math.PI / 16;
                badgeGroup.rotation.y = -Math.PI / 10;
                badgeGroup.scale.setScalar(0.7);

                group.add(badgeGroup);
                break;
            }

            case 'phone': {
                const phoneGroup = new THREE.Group();
                const phoneW = 0.22; const phoneH = 0.50; const phoneD = 0.03;

                // 1. Phone
                const body = new THREE.Mesh(
                    getGeo('phone_body_port', () => new THREE.BoxGeometry(phoneW, phoneH, phoneD)),
                    getMat('phone_mat_dark', () => new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.2, metalness: 0.6 }))
                );
                phoneGroup.add(body);

                // 2. Display (White background)
                const screen = new THREE.Mesh(
                    getGeo('phone_screen_port', () => new THREE.PlaneGeometry(phoneW - 0.02, phoneH - 0.02)),
                    getMat('phone_ui_bg', () => new THREE.MeshBasicMaterial({ color: 0xffffff }))
                );
                screen.position.z = phoneD / 2 + 0.001;
                phoneGroup.add(screen);

                // 3. iMessage-conversation
                const uiGroup = new THREE.Group();
                uiGroup.position.z = phoneD / 2 + 0.002;

                const matBlue = getMat('phone_blue', () => new THREE.MeshBasicMaterial({ color: 0x00aaee }));
                const matGray = getMat('phone_gray', () => new THREE.MeshBasicMaterial({ color: 0xdddddd }));
                const matText = getMat('phone_text_lines', () => new THREE.MeshBasicMaterial({ color: 0x000000 }));
                const matRed = getMat('phone_red', () => new THREE.MeshBasicMaterial({ color: 0xff0000 }));

                const bubble1 = new THREE.Mesh(getGeo('phone_b1', () => new THREE.PlaneGeometry(0.14, 0.07)), matGray);
                bubble1.position.set(-0.02, 0.14, 0);
                uiGroup.add(bubble1);
                const text1 = new THREE.Mesh(getGeo('phone_t1', () => new THREE.PlaneGeometry(0.1, 0.008)), matText);
                text1.position.set(0, 0.01, 0.001); bubble1.add(text1);
                const text2 = new THREE.Mesh(getGeo('phone_t2', () => new THREE.PlaneGeometry(0.06, 0.008)), matText);
                text2.position.set(-0.02, -0.015, 0.001); bubble1.add(text2);

                const bubble2 = new THREE.Mesh(getGeo('phone_b2', () => new THREE.PlaneGeometry(0.12, 0.06)), matBlue);
                bubble2.position.set(0.03, 0.05, 0);
                uiGroup.add(bubble2);
                const text3 = new THREE.Mesh(getGeo('phone_t3', () => new THREE.PlaneGeometry(0.09, 0.008)), matText);
                text3.position.set(0, 0, 0.001); bubble2.add(text3);

                const bubble3 = new THREE.Mesh(getGeo('phone_b3', () => new THREE.PlaneGeometry(0.15, 0.08)), matBlue);
                bubble3.position.set(0.015, -0.04, 0);
                uiGroup.add(bubble3);
                const text4 = new THREE.Mesh(getGeo('phone_t4', () => new THREE.PlaneGeometry(0.12, 0.008)), matText);
                text4.position.set(0, 0.015, 0.001); bubble3.add(text4);
                const text5 = new THREE.Mesh(getGeo('phone_t5', () => new THREE.PlaneGeometry(0.08, 0.008)), matText);
                text5.position.set(-0.02, -0.01, 0.001); bubble3.add(text5);

                const failedText = new THREE.Mesh(getGeo('phone_failed', () => new THREE.PlaneGeometry(0.16, 0.006)), matRed);
                failedText.position.set(0, -0.21, 0);
                uiGroup.add(failedText);

                phoneGroup.add(uiGroup);

                // 4. Cracks (Outermost)
                const crackGroup = new THREE.Group();
                crackGroup.position.z = phoneD / 2 + 0.004;

                const matCrack = getMat('phone_crack_mat', () => new THREE.MeshBasicMaterial({ color: 0x111111 }));

                const bleed = new THREE.Mesh(getGeo('phone_bleed', () => new THREE.CircleGeometry(0.035, 6)), matCrack);
                bleed.position.set(-0.06, -0.08, 0);
                crackGroup.add(bleed);

                const crack1 = new THREE.Mesh(getGeo('crack_1', () => new THREE.PlaneGeometry(0.28, 0.006)), matCrack);
                crack1.rotation.z = Math.PI / 6;
                crack1.position.set(0, -0.02, 0);
                crackGroup.add(crack1);

                const crack2 = new THREE.Mesh(getGeo('crack_2', () => new THREE.PlaneGeometry(0.18, 0.005)), matCrack);
                crack2.rotation.z = -Math.PI / 3;
                crack2.position.set(-0.02, 0.08, 0);
                crackGroup.add(crack2);

                phoneGroup.add(crackGroup);

                // 5. Screen light / Fake Glow
                // AdditiveBlending together with the extended white plane creates the glow.
                const screenGlowMat = getMat('phone_screen_glow', () => new THREE.MeshBasicMaterial({
                    map: getSharedGlowTexture(),
                    color: 0xffffff,
                    transparent: true,
                    blending: THREE.AdditiveBlending,
                    depthWrite: false,
                    opacity: 0.8
                }));

                // Gör planet 20 "cm" större än telefonen så att ljuset rinner ut över kanterna
                const screenGlow = new THREE.Mesh(
                    getGeo('phone_glow_geo', () => new THREE.PlaneGeometry(phoneW + 0.20, phoneH + 0.20)),
                    screenGlowMat
                );
                // Lägg skenet precis ovanför skärmen och sprickorna
                screenGlow.position.z = phoneD / 2 + 0.01;
                phoneGroup.add(screenGlow);

                // Orientering
                phoneGroup.rotation.x = -Math.PI / 10;
                phoneGroup.rotation.y = -Math.PI / 10;
                group.add(phoneGroup);
                break;
            }

            case 'jacket': {
                const jacketGroup = new THREE.Group();

                const matJacket = getMat('jacket_mat', () => new THREE.MeshStandardMaterial({ color: 0xbe6baf, roughness: 0.8 }));
                const matDetail = getMat('jacket_detail_mat', () => new THREE.MeshBasicMaterial({ color: 0x111111 }));

                const bodyW = 0.80; const bodyH = 0.70; const bodyD = 0.30;

                const body = new THREE.Mesh(getGeo('jacket_body_stand', () => new THREE.BoxGeometry(bodyW, bodyH, bodyD)), matJacket);
                jacketGroup.add(body);

                const placket = new THREE.Mesh(getGeo('jacket_placket_stand', () => new THREE.BoxGeometry(0.08, bodyH + 0.001, bodyD - 0.10 + 0.012)), matDetail);
                jacketGroup.add(placket);

                const collarD = bodyD / 2;
                const collar = new THREE.Mesh(getGeo('jacket_collar_stand', () => new THREE.CylinderGeometry(collarD, collarD, collarD, 12)), matJacket);
                collar.position.set(0, bodyH / 2 + 0.075, 0);
                jacketGroup.add(collar);

                const sleeveW = 0.22; const sleeveH = 0.55; const sleeveD = bodyD / 2;

                const sleeveGeo = getGeo('jacket_sleeve_pivot', () => {
                    const geo = new THREE.BoxGeometry(sleeveW, sleeveH, sleeveD);
                    geo.translate(0, -sleeveH / 2, 0);
                    return geo;
                });

                const sleeveL = new THREE.Mesh(sleeveGeo, matJacket);
                sleeveL.position.set(-bodyW / 2 - sleeveW / 2 + 0.18, bodyH / 2 - 0.075, 0);
                sleeveL.rotation.z = -Math.PI / 4;
                jacketGroup.add(sleeveL);

                const sleeveR = new THREE.Mesh(sleeveGeo, matJacket);
                sleeveR.position.set(bodyW / 2 + sleeveW / 2 - 0.18, bodyH / 2 - 0.075, 0);
                sleeveR.rotation.z = Math.PI / 4
                jacketGroup.add(sleeveR);

                jacketGroup.position.y = -0.1;
                jacketGroup.rotation.y = -Math.PI / 10;
                group.add(jacketGroup);
                break;
            }

            case 'diary': {
                const bookGroup = new THREE.Group();

                const matCover = getMat('diary_cover_pink', () => new THREE.MeshStandardMaterial({ color: 0xffb6c1, roughness: 0.8 }));
                const matPages = getMat('diary_pages_white', () => new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1.0 }));
                const matLine = getMat('diary_page_lines_darker', () => new THREE.MeshBasicMaterial({ color: 0x666666 }));
                const matGold = getMat('ring_gold_pure', () => new THREE.MeshStandardMaterial({ color: 0xffd700, metalness: 1.0, roughness: 0.1 }));
                const matStrap = getMat('diary_strap_brown', () => new THREE.MeshStandardMaterial({ color: 0x8b4513 }));

                const coverW = 0.65; const coverH = 0.85; const coverD = 0.18;

                const frontCover = new THREE.Mesh(getGeo('diary_cover_f', () => new THREE.BoxGeometry(coverW, coverH, 0.02)), matCover);
                frontCover.position.set(0.02, 0, coverD / 2);
                bookGroup.add(frontCover);

                const backCover = new THREE.Mesh(getGeo('diary_cover_b', () => new THREE.BoxGeometry(coverW, coverH, 0.02)), matCover);
                backCover.position.set(0.02, 0, -coverD / 2);
                bookGroup.add(backCover);

                const spine = new THREE.Mesh(getGeo('diary_cover_s', () => new THREE.BoxGeometry(0.03, coverH, coverD + 0.02)), matCover);
                spine.position.set(-coverW / 2 + 0.005, 0, 0);
                bookGroup.add(spine);

                const paperW = 0.58; const paperH = 0.78; const paperD = coverD - 0.01;
                const paperBlock = new THREE.Mesh(getGeo('diary_pages', () => new THREE.BoxGeometry(paperW, paperH, paperD)), matPages);
                paperBlock.position.x = 0.035;
                bookGroup.add(paperBlock);

                const lineGeo = getGeo('diary_page_line_vert', () => new THREE.BoxGeometry(paperW + 0.002, paperH + 0.002, 0.002));
                for (let i = 1; i <= 5; i++) {
                    const line = new THREE.Mesh(lineGeo, matLine);
                    const zPos = -paperD / 2 + i * (paperD / 6);
                    line.position.set(0.035, 0, zPos);
                    bookGroup.add(line);
                }

                const strap = new THREE.Mesh(getGeo('diary_strap', () => new THREE.BoxGeometry(0.68, 0.08, coverD + 0.03)), matStrap);
                strap.position.set(0.02, -0.1, 0);
                bookGroup.add(strap);

                const lockGroup = new THREE.Group();
                lockGroup.add(new THREE.Mesh(getGeo('diary_lock_b', () => new THREE.SphereGeometry(0.04, 6, 6)), matGold));
                const lockShackle = new THREE.Mesh(getGeo('diary_lock_s', () => new THREE.TorusGeometry(0.025, 0.006, 6, 8, Math.PI)), matGold);
                lockShackle.position.y = 0.03;
                lockGroup.add(lockShackle);
                lockGroup.position.set(0.32, -0.1, coverD / 2 + 0.035);
                lockGroup.rotation.y = Math.PI / 8;
                bookGroup.add(lockGroup);

                bookGroup.rotation.z = Math.PI / 8;
                bookGroup.rotation.y = -Math.PI / 6;

                group.add(bookGroup);
                break;
            }

            case 'ring': {
                const ringGroup = new THREE.Group();

                const matGold = getMat('ring_gold_pure', () => new THREE.MeshStandardMaterial({ color: 0xffc000, metalness: 1.0, roughness: 0.1 }));
                const matDiamond = getMat('ring_diamond_cyan_mat', () => new THREE.MeshStandardMaterial({
                    color: 0x00ffff, transparent: true, opacity: 0.9, roughness: 0.0, metalness: 0.0, flatShading: true
                }));
                const matRays = getMat('ring_rays_mat', () => new THREE.MeshBasicMaterial({
                    color: 0xffffff, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false
                }));

                const band = new THREE.Mesh(getGeo('ring_band_photo', () => new THREE.TorusGeometry(0.1, 0.02, 6, 16)), matGold);
                ringGroup.add(band);

                const bezel = new THREE.Mesh(getGeo('ring_bezel_geo', () => new THREE.CylinderGeometry(0.065, 0.055, 0.03, 6)), matGold);
                bezel.position.set(0, 0.1, 0);
                ringGroup.add(bezel);

                const diamondPoints = [
                    new THREE.Vector2(0.001, -0.06), new THREE.Vector2(0.06, 0.0),
                    new THREE.Vector2(0.05, 0.03), new THREE.Vector2(0.001, 0.03)
                ];
                const mainStone = new THREE.Mesh(getGeo('ring_diamond_cut', () => new THREE.LatheGeometry(diamondPoints, 6)), matDiamond);
                mainStone.position.set(0, 0.13, 0);
                ringGroup.add(mainStone);

                // Light from the diamond with Fake Glow
                const diamondGlowMat = getMat('ring_diamond_glow', () => new THREE.SpriteMaterial({
                    map: getSharedGlowTexture(),
                    color: 0xffffff,
                    transparent: true,
                    blending: THREE.AdditiveBlending,
                    depthWrite: false,
                    opacity: 0.9
                }));
                const diamondGlow = new THREE.Sprite(diamondGlowMat);
                diamondGlow.scale.set(0.4, 0.4, 0.4);
                diamondGlow.position.set(0, 0.13, 0);
                ringGroup.add(diamondGlow);

                const rayGeo = getGeo('ring_ray_geo', () => {
                    const geo = new THREE.ConeGeometry(0.006, 0.15, 4);
                    geo.translate(0, 0.075, 0);
                    return geo;
                });

                for (let i = 0; i < 5; i++) {
                    const ray = new THREE.Mesh(rayGeo, matRays);
                    ray.position.set(0, 0.13, 0);
                    ray.rotation.z = (i * (Math.PI * 2)) / 5;
                    ray.rotation.x = Math.PI / 8;
                    ringGroup.add(ray);
                }

                ringGroup.rotation.y = Math.PI / 4;
                ringGroup.rotation.x = Math.PI / 12;
                group.add(ringGroup);
                break;
            }

            case 'teddy': {
                const brownMat = getMat('teddy_brown', () => new THREE.MeshStandardMaterial({ color: 0x8b4513, roughness: 0.9 }));
                const whiteMat = getMat('teddy_white', () => new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 }));
                const blackMat = getMat('teddy_black', () => new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.5 }));

                const body = new THREE.Mesh(getGeo('teddy_body', () => new THREE.SphereGeometry(0.3, 8, 8)), brownMat);
                group.add(body);

                const head = new THREE.Mesh(getGeo('teddy_head', () => new THREE.SphereGeometry(0.22, 8, 8)), brownMat);
                head.position.y = 0.4;
                group.add(head);

                const earGeo = getGeo('teddy_ear', () => new THREE.SphereGeometry(0.08, 8, 8));

                const earL = new THREE.Mesh(earGeo, brownMat);
                earL.position.set(0.15, 0.56, 0);
                group.add(earL);

                const earR = new THREE.Mesh(earGeo, brownMat);
                earR.position.set(-0.15, 0.56, 0);
                group.add(earR);

                const eyeGeo = getGeo('teddy_eye', () => new THREE.SphereGeometry(0.04, 8, 8));

                const eyeL = new THREE.Mesh(eyeGeo, whiteMat);
                eyeL.position.set(0.08, 0.45, 0.18);
                group.add(eyeL);

                const eyeR = new THREE.Mesh(eyeGeo, whiteMat);
                eyeR.position.set(-0.08, 0.45, 0.18);
                group.add(eyeR);

                const pupilGeo = getGeo('teddy_pupil', () => new THREE.SphereGeometry(0.02, 6, 6));

                const pupilL = new THREE.Mesh(pupilGeo, blackMat);
                pupilL.position.set(0.08, 0.45, 0.21);
                group.add(pupilL);

                const pupilR = new THREE.Mesh(pupilGeo, blackMat);
                pupilR.position.set(-0.08, 0.45, 0.21);
                group.add(pupilR);

                const noseGeo = getGeo('teddy_nose', () => new THREE.SphereGeometry(0.03, 6, 6));
                const nose = new THREE.Mesh(noseGeo, blackMat);
                nose.position.set(0, 0.38, 0.21);
                group.add(nose);

                break;
            }

            default: {
                const placeholder = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), new THREE.MeshStandardMaterial({ color: 0xff00ff }));
                group.add(placeholder);
                break;
            }
        }

        // --- FAKE GLOW (Optimized lighting that surrounds all objects) ---
        const glowMat = getMat('collectible_glow_mat', () => new THREE.SpriteMaterial({
            map: getSharedGlowTexture(),
            color: 0xffcc00, // Gold yellow color for items
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            opacity: 0.6 // Adjust how strongly it should "shine" in the surroundings
        }));

        const fakeGlow = new THREE.Sprite(glowMat);
        fakeGlow.scale.set(1.5, 1.5, 1.5); // Make the glow large enough to surround the object
        fakeGlow.position.set(0, 0.2, 0);
        fakeGlow.name = 'collectibleGlow';
        group.add(fakeGlow);

        // Save the finished hierarchy in our prefab cache
        prefabCache[type] = group;

        // Return a clone even the first time so we protect our master prefab
        const initialClone = group.clone();
        initialClone.userData = { type };
        return initialClone;
    }
};