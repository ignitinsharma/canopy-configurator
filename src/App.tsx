import { lazy, Suspense, useState } from 'react';
import clsx from 'clsx';
import { useEmbedMode } from '@features/embed/useEmbedMode';

import { ConfiguratorProvider } from './features/ConfiguratorContext';
import { OptionsPanel } from './features/panels/OptionsPanel';
import { PriceBar } from './features/pricing/PriceBar';
const Editor = lazy(() => import('./features/editor2d/Editor'));
const Viewer = lazy(() => import('./features/viewer3d/Viewer'));

const areas = [
  {
    id: 'options',
    label: 'Options',
    title: 'Product options',
    description: 'Product choices will appear here.',
  },
  {
    id: 'editor',
    label: '2D',
    title: '2D editor',
    description: 'Your design workspace will appear here.',
  },
  {
    id: 'viewer',
    label: '3D',
    title: '3D preview',
    description: 'Your product preview will appear here.',
  },
] as const;
type Area = (typeof areas)[number]['id'];

export default function App() {
  return (
    <ConfiguratorProvider>
      <AppShell />
    </ConfiguratorProvider>
  );
}
function AppShell() {
  const embed = useEmbedMode();
  const [activeArea, setActiveArea] = useState<Area>('options');
  return (
    <div className={clsx('app', embed && 'app--embedded')}>
      {!embed && (
        <header className="page-header">
          <span className="brand">Product studio</span>
          <span className="status">Configurator foundation</span>
        </header>
      )}
      <main className="workspace" aria-label="Product configurator">
        <nav className="mobile-tabs" aria-label="Workspace views">
          {areas.map((area) => (
            <button
              key={area.id}
              type="button"
              aria-pressed={activeArea === area.id}
              aria-controls={`area-${area.id}`}
              onClick={() => setActiveArea(area.id)}
            >
              {area.label}
            </button>
          ))}
        </nav>
        <div className="workspace-grid">
          {areas.map((area) => (
            <section
              key={area.id}
              id={`area-${area.id}`}
              aria-labelledby={`heading-${area.id}`}
              className={clsx(
                'workspace-area',
                `workspace-area--${area.id}`,
                activeArea === area.id && 'is-active',
              )}
            >
              <h1 id={`heading-${area.id}`}>{area.title}</h1>
              {area.id === 'options' ? (
                <OptionsPanel />
              ) : area.id === 'viewer' ? (
                <Suspense
                  fallback={
                    <div className="viewer-skeleton" role="status">
                      Loading 3D preview…
                    </div>
                  }
                >
                  <Viewer />
                </Suspense>
              ) : (
                <Suspense
                  fallback={
                    <div className="viewer-skeleton" role="status">
                      Loading 2D editor…
                    </div>
                  }
                >
                  <Editor />
                </Suspense>
              )}
            </section>
          ))}
        </div>
        <PriceBar />
      </main>
      {!embed && (
        <footer className="page-footer">
          Reusable product configurator · Development scaffold
        </footer>
      )}
    </div>
  );
}
