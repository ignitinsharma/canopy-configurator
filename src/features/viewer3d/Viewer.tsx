import {
  Component,
  Suspense,
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type ReactNode,
  type ComponentRef,
  type Ref,
} from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei/core/OrbitControls';
import { ContactShadows } from '@react-three/drei/core/ContactShadows';
import { useProgress } from '@react-three/drei/core/Progress';
import { Html } from '@react-three/drei/web/Html';
import { useGLTF } from '@react-three/drei/core/Gltf';
import {
  ACESFilmicToneMapping,
  PCFSoftShadowMap,
  PerspectiveCamera,
  Vector3,
} from 'three';
import { useConfigSelector } from '../ConfiguratorContext';
import { TentModel } from './TentModel';
import type { AtlasApi } from './atlas';
import { viewPosition, type CaptureSide } from './camera';
import {
  captureViews as renderCaptures,
  type CaptureOptions,
  type CapturedViews,
} from './capture';
export interface ViewerHandle {
  captureViews(options?: CaptureOptions): Promise<CapturedViews>;
}
class ViewerErrorBoundary extends Component<
  { children: ReactNode; retry: () => void },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    return this.state.error ? (
      <div role="alert" className="viewer-message">
        <p>Unable to load the 3D preview.</p>
        <p>{this.state.error.message}</p>
        <button
          type="button"
          onClick={() => {
            this.props.retry();
            this.setState({ error: null });
          }}
        >
          Retry 3D preview
        </button>
      </div>
    ) : (
      this.props.children
    );
  }
}
function Progress() {
  const { active, progress } = useProgress();
  return active ? (
    <div className="viewer-progress" role="status">
      Loading models · {Math.round(progress)}%
    </div>
  ) : null;
}
function Loading() {
  return (
    <Html center>
      <div className="viewer-skeleton" role="status">
        Loading 3D preview…
      </div>
    </Html>
  );
}
function Scene({
  captureRef,
  reset,
}: {
  captureRef: Ref<ViewerHandle>;
  reset: number;
}) {
  const definition = useConfigSelector((s) => s.definition),
    variantId = useConfigSelector((s) => s.config.variantId),
    selected = useConfigSelector((s) => s.ui.selectedSectionId);
  const variant = definition.variants.find((v) => v.id === variantId)!;
  const width = variant.realWidthMeters;
  const { camera, gl, scene, invalidate } = useThree();
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null);
  const [height, setHeight] = useState(width * 1.5);
  const ready = useRef(false);
  const atlasRef = useRef<AtlasApi | null>(null);
  const onReady = useCallback((h: number, atlas: AtlasApi) => {
    atlasRef.current = atlas;
    ready.current = true;
    setHeight(h);
  }, []);
  const goal = useRef<{ position: Vector3; target: Vector3 } | null>(null);
  useEffect(() => {
    const side = selected.split('-').at(-1);
    const allowed = ['front', 'back', 'left', 'right'];
    goal.current = {
      position: viewPosition(
        allowed.includes(side ?? '') ? (side as CaptureSide) : 'front',
        width,
        height,
        selected.startsWith('roof-'),
      ),
      target: new Vector3(0, height * 0.45, 0),
    };
    invalidate();
  }, [selected, width, height, invalidate]);
  useEffect(() => {
    goal.current = {
      position: new Vector3(width * 1.9, height * 0.85, width * 1.9),
      target: new Vector3(0, height * 0.45, 0),
    };
    invalidate();
  }, [reset, width, height, invalidate]);
  useFrame((_, delta) => {
    if (!goal.current || !controls.current) return;
    const alpha = 1 - Math.exp(-delta * 7);
    camera.position.lerp(goal.current.position, alpha);
    controls.current.target.lerp(goal.current.target, alpha);
    controls.current.update();
    if (
      camera.position.distanceTo(goal.current.position) < 0.002 &&
      controls.current.target.distanceTo(goal.current.target) < 0.002
    ) {
      camera.position.copy(goal.current.position);
      controls.current.target.copy(goal.current.target);
      goal.current = null;
    } else invalidate();
  });
  useImperativeHandle(
    captureRef,
    () => ({
      async captureViews(options) {
        if (!ready.current || !(camera instanceof PerspectiveCamera))
          throw new Error('Model is not ready');
        const atlas = atlasRef.current;
        atlas?.setOverlay(null, false);
        try {
          return renderCaptures(gl, scene, camera, width, height, options);
        } finally {
          atlas?.setOverlay(
            selected,
            new URLSearchParams(window.location.search).get('debug') ===
              'atlas',
          );
          invalidate();
        }
      },
    }),
    [camera, gl, scene, width, height, selected, invalidate],
  );
  return (
    <>
      <color attach="background" args={['#f0f1ef']} />
      <hemisphereLight args={['#ffffff', '#7c8278', 2]} />
      <directionalLight
        position={[width * 2, height * 2, width]}
        intensity={3}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-width * 2}
        shadow-camera-right={width * 2}
        shadow-camera-top={height * 2}
        shadow-camera-bottom={-height * 2}
        shadow-camera-far={height * 6}
        shadow-normalBias={0.025}
      />
      <Suspense fallback={<Loading />}>
        <TentModel key={variant.id} variant={variant} onReady={onReady} />
      </Suspense>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -0.012, 0]}
        receiveShadow
      >
        <planeGeometry args={[width * 20, width * 20]} />
        <shadowMaterial transparent opacity={0.14} />
      </mesh>
      <ContactShadows
        key={`${variant.id}-${height}`}
        position={[0, -0.005, 0]}
        opacity={0.35}
        scale={width * 5}
        blur={2.5}
        far={height * 2}
        resolution={512}
        frames={8}
      />
      <OrbitControls
        ref={controls}
        makeDefault
        enablePan={false}
        enableDamping
        dampingFactor={0.08}
        minPolarAngle={0.05}
        maxPolarAngle={Math.PI / 2 - 0.03}
        minDistance={width * 0.7}
        maxDistance={width * 6}
        onStart={() => {
          goal.current = null;
        }}
        onChange={() => invalidate()}
      />
    </>
  );
}
const Viewer = forwardRef<ViewerHandle>(function Viewer(_, ref) {
  const [reset, setReset] = useState(0),
    [attempt, setAttempt] = useState(0);
  const definition = useConfigSelector((s) => s.definition);
  const variant = useConfigSelector((s) => s.config.variantId);
  const width = definition.variants.find(
    (v) => v.id === variant,
  )!.realWidthMeters;
  return (
    <div className="viewer" data-testid="viewer">
      <ViewerErrorBoundary
        retry={() => {
          definition.variants.forEach((v) => useGLTF.clear(v.modelUrl));
          setAttempt((a) => a + 1);
        }}
      >
        <Canvas
          key={attempt}
          frameloop="demand"
          dpr={[1, 2]}
          shadows
          gl={{ antialias: true }}
          camera={{
            position: [width * 2, width * 2, width * 2],
            fov: 42,
            near: 0.01,
            far: 100,
          }}
          onCreated={({ gl }) => {
            gl.toneMapping = ACESFilmicToneMapping;
            gl.shadowMap.type = PCFSoftShadowMap;
          }}
          fallback={
            <div role="alert">WebGL is unavailable in this browser.</div>
          }
        >
          <Scene key={variant} captureRef={ref} reset={reset} />
        </Canvas>
      </ViewerErrorBoundary>
      <Progress />
      <button
        className="viewer-reset"
        type="button"
        onClick={() => setReset((n) => n + 1)}
      >
        Reset view
      </button>
    </div>
  );
});
export default Viewer;
