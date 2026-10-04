import { createClient } from '@supabase/supabase-js';

// cafeore-pos と同じ Postgres（Supabase）の caos スキーマを読み書きする。
// 匿名キーは公開してよい鍵で、読み書きできる範囲は RLS とスタッフ登録（caos.staff）で絞っている。
const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = url && anonKey ? createClient(url, anonKey, { db: { schema: 'caos' } }) : null;
