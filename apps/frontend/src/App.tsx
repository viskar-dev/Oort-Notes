import { useEffect, useState } from 'react';
// import { Canvas } from './canvas/Canvas';
import { api } from './ipc';

export default function App() {
  const [pong, setPong] = useState<string>('...');

  useEffect(() => {
    api.ping()
      .then(setPong)
      .catch((e) => setPong(`error: ${e.message ?? e}`));
  }, []);

  return (
    <div style={{ width: '100vw', height: '100vh', margin: 0, padding: 0, position: 'relative' }}>
      {/*<Canvas />*/}
      <div style={{
        position: 'absolute',
        top: 12,
        left: 12,
        padding: '6px 10px',
        background: 'rgba(0,0,0,0.7)',
        color: '#fff',
        fontFamily: 'monospace',
        fontSize: 12,
        borderRadius: 4,
        pointerEvents: 'none',
      }}>
        ping: {pong}
      </div>
    </div>
  );
}
