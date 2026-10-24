import { useState } from 'react';

/** Standalone practice editor. Messages never leave the practice session. */
export function VoiceComment({ orderId, sending, send }: { orderId: string; sending: boolean; send: (id: string, text: string) => Promise<boolean>; inline?: unknown }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  return <><button type="button" disabled={sending} onClick={() => setOpen(!open)} className="min-h-12 rounded border border-slate-300 bg-white px-2 text-xs font-bold">文章で返信</button>{open && <form className="w-full space-y-2" onSubmit={async (event) => { event.preventDefault(); if (text.trim() && await send(orderId, text.trim())) { setText(''); setOpen(false); } }}><label className="block text-xs">練習内のコメント<textarea aria-label="練習内のコメント" value={text} maxLength={200} onChange={(event) => setText(event.target.value)} className="block w-full rounded border p-2" /></label><button type="submit" disabled={sending || !text.trim()} className="min-h-10 rounded border px-3 font-bold">返信を記録</button></form>}</>;
}
