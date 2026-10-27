export type PublicationStatus = { status: 'sending' | 'sent' | 'failed'; error?: string };
export function ScorePublisher({
  name,
  publication,
  onRetry,
}: {
  name: string;
  publication?: PublicationStatus | null;
  onRetry: () => Promise<void>;
}) {
  return (
    <section className="training-score-publisher" aria-label="ランキングへの自動掲載" role="status">
      <strong className={publication?.status === 'sent' ? 'training-publish-done' : ''}>
        {publication?.status === 'sent'
          ? `${name}のスコアをランキングに載せました。`
          : publication?.status === 'failed'
            ? `${name}のスコアを送れませんでした。`
            : `${name}のスコアを自動掲載中…`}
      </strong>
      {publication?.status === 'failed' && (
        <>
          <button type="button" className="training-primary" onClick={() => void onRetry()}>
            再送する
          </button>
          <p className="training-error">{publication.error}</p>
          <small>保存済みの記録はランキング画面からも再送できます。</small>
        </>
      )}
    </section>
  );
}
