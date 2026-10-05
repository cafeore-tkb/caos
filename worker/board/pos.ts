// cafeore-pos の API への準備完了・取り消し。
// PATCH /api/orders/:id/ready は「押すたびに準備完了と未完了が入れ替わる」作りなので、送り直しで逆に戻さないよう、
// 先に GET で今の状態を確かめ、違うときだけ PATCH する。

export type Desired = 'ready' | 'unready';

export type PosResult = 'done' | 'skipped' | 'retry';

interface PosOrderState {
  ready_at: string | null;
  served_at: string | null;
}

export async function setReady(
  baseUrl: string,
  orderId: string,
  desired: Desired,
  fetchImpl: typeof fetch = fetch
): Promise<PosResult> {
  const url = `${baseUrl.replace(/\/$/, '')}/api/orders/${encodeURIComponent(orderId)}`;
  const current = await fetchImpl(url, { headers: { Accept: 'application/json' } });
  // POS で消された注文は、もう送らない
  if (current.status === 404) return 'skipped';
  if (!current.ok) return 'retry';
  const order = (await current.json()) as PosOrderState;
  // 提供済みの注文の準備完了は取り消さない（POS の画面で「戻す」ものではない）
  if (desired === 'unready' && order.served_at !== null) return 'skipped';
  if ((order.ready_at !== null) === (desired === 'ready')) return 'done';

  const res = await fetchImpl(`${url}/ready`, { method: 'PATCH', headers: { Accept: 'application/json' } });
  if (res.status === 404) return 'skipped';
  if (!res.ok) return 'retry';
  const after = (await res.json()) as PosOrderState;
  // ほかの端末と同時に切り替えて逆になったら、次の回でもう一度確かめる
  return (after.ready_at !== null) === (desired === 'ready') ? 'done' : 'retry';
}
