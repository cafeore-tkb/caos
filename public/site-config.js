// CaOS のつなぎ先（Supabase。cafeore-pos・ShiftMaker と同じプロジェクトの caos スキーマ）。
// url は「Project Settings → API」の Project URL、key は公開キー（publishable key か anon key。公開しても問題ない値で、
// 何ができるかはデータベースの関数が決める＝supabase/migrations）。ビルドし直さずに差し替えられるよう、別ファイルのまま読み込む。
// 空にすると DB を使わず、実データテストだけが動く。
window.SUPABASE_CONFIG = {
  url: 'https://bpnlegxrpissstjxpnmp.supabase.co',
  key: 'sb_publishable_unY5bThcSHDfIGBMW6fyAQ_62xi2bic',
};
