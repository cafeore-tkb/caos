import { useState } from 'react';
import { readDisplayName } from './rankingClient';
export function ScorePublisher({ onPublish }: { onPublish: (name: string) => Promise<void> }) {
  const [name, setName] = useState(readDisplayName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [published, setPublished] = useState(false);
  if (published)
    return (
      <p className="training-publish-done" role="status">
        {name.trim()}の記録を載せました。
      </p>
    );
  return (
    <form
      className="training-score-publisher"
      aria-label="ランキングに載せる"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!name.trim()) {
          setError('表示名を入力してください');
          return;
        }
        setBusy(true);
        setError('');
        try {
          await onPublish(name.trim());
          setPublished(true);
        } catch (cause) {
          setError((cause as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <label>
        表示名
        <input
          required
          maxLength={30}
          autoComplete="nickname"
          placeholder="ランキングに載せる名前"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={busy}
        />
      </label>
      <button type="submit" className="training-primary" disabled={busy}>
        {busy ? '送信中…' : 'ランキングに載せる'}
      </button>
      <small>同じ表示名で記録をまとめます。載せずに終えても、端末に記録は残ります。</small>
      {error && (
        <p role="alert" className="training-error">
          {error}
        </p>
      )}
    </form>
  );
}
