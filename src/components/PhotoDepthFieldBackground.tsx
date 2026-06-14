import { Suspense, useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useTexture } from '@react-three/drei';
import * as THREE from 'three';

type PhotoPlaneConfig = {
	url: string;
	position: [number, number, number];
	rotation: [number, number, number];
	scale: number;
	parallax: number;
};

type PhotoPlacement = {
	position: [number, number, number];
	rotationZ: number;
	scale: number;
	parallax: number;
};

const textureUrls = Array.from({ length: 7 }, (_, index) => `/images/image0${index + 1}.jpg`);
const depthLayers = [6.6, 4.3, 1.2, 0, -1.2, -4.3, -6.6];

function pickRandomDepth(random: () => number) {
	const base = depthLayers[Math.floor(random() * depthLayers.length)] ?? 0;
	// 同じ奥行きレイヤーに複数の画像が配置された際のzファイティングを防ぐ小さなジッター
	return base + (random() - 0.5) * 0.3;
}

function getDepthWhiteOpacity(z: number) {
	const normalized = THREE.MathUtils.clamp((6.6 - z) / 13.2, 0, 1);
	const boosted = Math.pow(normalized, 0.85);
	return THREE.MathUtils.lerp(0.06, 0.72, boosted);
}

// 近い(z=6.6)→大きい、遠い(z=-6.6)→小さい
function scaleFromDepth(z: number, jitter: number): number {
	const normalized = THREE.MathUtils.clamp((z + 6.6) / 13.2, 0, 1); // 0=遠, 1=近
	return THREE.MathUtils.lerp(1.1, 3.4, normalized) + jitter * 0.4;
}

function getMaxWorldWidth(camera: THREE.Camera, pixelWidth: number, viewportWidth: number, z: number) {
	if (!(camera instanceof THREE.PerspectiveCamera) || pixelWidth <= 0) {
		return viewportWidth;
	}

	const distance = Math.max(0.1, camera.position.z - z);
	const visibleHeight = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * distance;
	const visibleWidth = visibleHeight * camera.aspect;

	return (540 / pixelWidth) * visibleWidth;
}

function createSeededRandom(seed: number) {
	return function seededRandom() {
		seed |= 0;
		seed = (seed + 0x6d2b79f5) | 0;
		let result = Math.imul(seed ^ (seed >>> 15), 1 | seed);
		result ^= result + Math.imul(result ^ (result >>> 7), 61 | result);
		return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
	};
}

function createPhotoPlanes(): PhotoPlaneConfig[] {
	const random = createSeededRandom(410);

	return textureUrls.map((url, index) => {
		const direction = index % 2 === 0 ? 1 : -1;
		const laneOffset = 3.2 + random() * 1.8;
		const x = direction * laneOffset;
		const y = 2.3 - index * 0.72 + (random() - 0.5) * 1.1;
		const z = pickRandomDepth(random);

		return {
			url,
			position: [x, y, z],
			rotation: [0, 0, 0],
			scale: scaleFromDepth(z, random()),
			parallax: 0.12 + random() * 0.18,
		};
	});
}

function createRandomPlacement(random: () => number, index: number): PhotoPlacement {
	const direction = random() > 0.5 ? 1 : -1;
	const laneOffset = 3.1 + random() * 2.3;
	const x = direction * laneOffset;
	const y = 2.6 - index * 0.65 + (random() - 0.5) * 2.1;
	const parallax = 0.12 + random() * 0.18;
	const z = pickRandomDepth(random);

	return {
		position: [x, y, z],
		rotationZ: 0,
		scale: scaleFromDepth(z, random()),
		parallax,
	};
}

const photoPlanes = createPhotoPlanes();

function CameraRig() {
	const { camera } = useThree();
	const targetRef = useRef({ x: 0, y: 0 });
	const currentRef = useRef({ x: 0, y: 0 });

	useEffect(() => {
		function onPointerMove(e: PointerEvent) {
			if (window.innerWidth > 0) {
				targetRef.current.x = (e.clientX / window.innerWidth - 0.5) * 2;
			}
			if (window.innerHeight > 0) {
				targetRef.current.y = (e.clientY / window.innerHeight - 0.5) * 2;
			}
		}
		function onReset() {
			targetRef.current.x = 0;
			targetRef.current.y = 0;
		}
		window.addEventListener('pointermove', onPointerMove, { passive: true });
		window.addEventListener('pointerleave', onReset);
		window.addEventListener('blur', onReset);
		return () => {
			window.removeEventListener('pointermove', onPointerMove);
			window.removeEventListener('pointerleave', onReset);
			window.removeEventListener('blur', onReset);
		};
	}, []);

	useFrame((_, delta) => {
		// 慣性補間: delta依存で安定した追従速度
		const k = 1 - Math.exp(-delta * 3.2);
		currentRef.current.x = THREE.MathUtils.lerp(currentRef.current.x, targetRef.current.x, k);
		currentRef.current.y = THREE.MathUtils.lerp(currentRef.current.y, targetRef.current.y, k);
		// カーソルが右に行くとカメラは左へわずかにシフト（視差感）
		camera.position.x = currentRef.current.x * 0.65;
		camera.position.y = currentRef.current.y * -0.42;
		camera.position.z = 12;
		camera.lookAt(0, 0, 0);
	});

	return null;
}

function PhotoPlane({ config, index }: { config: PhotoPlaneConfig; index: number }) {
	const texture = useTexture(config.url);
	const groupRef = useRef<THREE.Group>(null);
	const imageRef = useRef<THREE.Mesh>(null);
	const whiteOverlayRef = useRef<THREE.Mesh>(null);
	const { camera, size, viewport } = useThree();
	const randomRef = useRef(createSeededRandom(900 + index * 137));
	const activePlacementRef = useRef<PhotoPlacement>({
		position: config.position,
		rotationZ: 0,
		scale: config.scale,
		parallax: config.parallax,
	});
	const nextPlacementRef = useRef<PhotoPlacement | null>(null);
	const phaseRef = useRef<'visible' | 'fading-out' | 'fading-in'>('visible');
	const phaseElapsedRef = useRef(0);
	const visibleDurationRef = useRef(4.5 + randomRef.current() * 3.5);

	texture.colorSpace = THREE.SRGBColorSpace;
	texture.anisotropy = 2;
	texture.generateMipmaps = false;
	texture.minFilter = THREE.LinearFilter;
	texture.magFilter = THREE.LinearFilter;
	texture.needsUpdate = true;

	const initialViewport = viewport.getCurrentViewport(camera, new THREE.Vector3(...config.position));
	const initialPlaneWidth = useMemo(() => {
		const maxWorldWidth = getMaxWorldWidth(camera, size.width, initialViewport.width, config.position[2]);
		return Math.min(config.scale, maxWorldWidth);
	}, [camera, config.position, config.scale, initialViewport.width, size.width]);
	const initialPlaneHeight = initialPlaneWidth * 1.32;

	// キャッシュ: placement変更時のみ再計算する
	const cachedDepthWhiteOpacityRef = useRef(getDepthWhiteOpacity(config.position[2]));
	const cachedPlaneWidthRef = useRef(initialPlaneWidth);
	const cachedPlaneHeightRef = useRef(initialPlaneHeight);

	useFrame(({ clock }, delta) => {
		const group = groupRef.current as THREE.Group | undefined;
		const imageMesh = imageRef.current;
		const whiteOverlayMesh = whiteOverlayRef.current;
		if (!group || !imageMesh || !whiteOverlayMesh) {
			return;
		}

		const imageMaterial = imageMesh.material as THREE.Material;
		const whiteOverlayMaterial = whiteOverlayMesh.material as THREE.MeshBasicMaterial;
		const fadeDuration = 1.2;

		phaseElapsedRef.current += delta;

		if (phaseRef.current === 'visible') {
			if (phaseElapsedRef.current >= visibleDurationRef.current) {
				phaseRef.current = 'fading-out';
				phaseElapsedRef.current = 0;
				nextPlacementRef.current = createRandomPlacement(randomRef.current, index);
			}
		} else if (phaseRef.current === 'fading-out') {
			const progress = Math.min(phaseElapsedRef.current / fadeDuration, 1);
			const opacity = 1 - progress;
			imageMaterial.opacity = opacity;
			whiteOverlayMaterial.opacity = opacity * cachedDepthWhiteOpacityRef.current;

			if (progress >= 1) {
				const nextPlacement = nextPlacementRef.current;
				if (nextPlacement) {
					activePlacementRef.current = nextPlacement;
					group.position.set(nextPlacement.position[0], nextPlacement.position[1], nextPlacement.position[2]);
					group.rotation.set(0, 0, 0);
					// placement変更時のみ高コスト計算・スケール更新
					cachedDepthWhiteOpacityRef.current = getDepthWhiteOpacity(nextPlacement.position[2]);
					const pw = Math.min(nextPlacement.scale, getMaxWorldWidth(camera, size.width, initialViewport.width, nextPlacement.position[2]));
					const ph = pw * 1.32;
					cachedPlaneWidthRef.current = pw;
					cachedPlaneHeightRef.current = ph;
					imageMesh.scale.set(pw, ph, 1);
					whiteOverlayMesh.scale.set(pw, ph, 1);
				}
				phaseRef.current = 'fading-in';
				phaseElapsedRef.current = 0;
			}
		} else {
			const progress = Math.min(phaseElapsedRef.current / fadeDuration, 1);
			imageMaterial.opacity = progress;
			whiteOverlayMaterial.opacity = progress * cachedDepthWhiteOpacityRef.current;

			if (progress >= 1) {
				imageMaterial.opacity = 1;
				whiteOverlayMaterial.opacity = cachedDepthWhiteOpacityRef.current;
				phaseRef.current = 'visible';
				phaseElapsedRef.current = 0;
				visibleDurationRef.current = 4.5 + randomRef.current() * 3.5;
				nextPlacementRef.current = null;
			}
		}

		const elapsed = clock.getElapsedTime();
		const ap = activePlacementRef.current;
		// x と z は placement.set() 済みのため、毎フレームは y のみ更新
		group.position.y = ap.position[1] + Math.sin(elapsed * 0.22 + ap.position[0]) * ap.parallax;
	});

	return (
		<group ref={groupRef} position={config.position} rotation={config.rotation}>
			<mesh ref={imageRef} position={[0, 0, 0]} scale={[initialPlaneWidth, initialPlaneHeight, 1]}>
				<planeGeometry args={[1, 1]} />
				<meshBasicMaterial map={texture} toneMapped={false} transparent opacity={1} />
			</mesh>
			<mesh ref={whiteOverlayRef} position={[0, 0, 0.005]} scale={[initialPlaneWidth, initialPlaneHeight, 1]}>
				<planeGeometry args={[1, 1]} />
				<meshBasicMaterial color="#ffffff" transparent opacity={getDepthWhiteOpacity(config.position[2])} />
			</mesh>
		</group>
	);
}

function Scene() {
	return (
		<>
			<color attach="background" args={["#ffffff"]} />
			<CameraRig />
			<ambientLight intensity={2.2} />
			{photoPlanes.map((config, index) => (
				<PhotoPlane key={config.url} config={config} index={index} />
			))}
		</>
	);
}

export default function PhotoDepthFieldBackground() {
	return (
		<div style={{ width: '100%', height: '100%', background: '#ffffff' }}>
			<Canvas
				style={{ background: '#ffffff' }}
				camera={{ position: [0, 0, 12], fov: 60, near: 0.1, far: 40 }}
				dpr={[1, 2]}
				gl={{ antialias: true, alpha: false, stencil: false }}
			>
				<Suspense fallback={null}>
					<Scene />
				</Suspense>
			</Canvas>
		</div>
	);
}