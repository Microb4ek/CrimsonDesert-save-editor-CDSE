import { useEffect, useState } from 'react';

export function TitleBar({ fileName, dirty }: { fileName?: string; dirty?: boolean }): JSX.Element {
  const [max, setMax] = useState(false);
  useEffect(() => {
    void window.api.window.isMaximized().then(setMax);
    return window.api.window.onMaximizedChange(setMax);
  }, []);
  return (
    <div className="titlebar">
      <div className="brand">
        <span className="dot" />
        Crimson Desert Save Editor
      </div>
      <div className="spacer" />
      {fileName && (
        <div className="file">
          <b>{fileName}</b>
          {dirty && <span className="dirty">● unsaved</span>}
        </div>
      )}
      <div className="spacer" />
      <div className="win-controls">
        <button onClick={() => window.api.window.minimize()} title="Minimize">
          ─
        </button>
        <button onClick={() => window.api.window.maximize()} title={max ? 'Restore' : 'Maximize'}>
          {max ? '❐' : '☐'}
        </button>
        <button className="close" onClick={() => window.api.window.close()} title="Close">
          ✕
        </button>
      </div>
    </div>
  );
}
