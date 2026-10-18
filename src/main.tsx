import { lazy, StrictMode, Suspense, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';

const App = lazy(() => import('./App.tsx'));
const TrainingApp = lazy(() => import('./training/TrainingApp.tsx'));

function Root() {
  const [training, setTraining] = useState(() => location.hash === '#training');
  const [visitedLive, setVisitedLive] = useState(() => location.hash !== '#training');
  useEffect(() => {
    const change = () => {
      const next = location.hash === '#training';
      setTraining(next);
      if (!next) setVisitedLive(true);
    };
    addEventListener('hashchange', change);
    return () => removeEventListener('hashchange', change);
  }, []);
  return (
    <Suspense fallback={<p className="p-8">CaOS を読み込み中…</p>}>
      {visitedLive && (
        <div hidden={training}>
          <App suspended={training} />
        </div>
      )}
      {training && <TrainingApp />}
    </Suspense>
  );
}

import './index.css';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Root element #root was not found');
}

createRoot(rootElement).render(
  <StrictMode>
    <Root />
  </StrictMode>
);
