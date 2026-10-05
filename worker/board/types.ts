// 盤面（Durable Object）と画面がやりとりする形。画面（src/）からも import する。

/** 抽出カードの中身の 1 行（どの注文の、どの商品を、何杯） */
export interface DripLine {
  order_id: string;
  order_no: number;
  item_id: string;
  name: string;
  abbr: string;
  type: string;
  nominee: string | null;
  cups: number;
}

/**
 * 抽出カード。1 回のドリップ（最大 2 杯）が 1 枚。
 * 保存するのは事実だけ（どの注文の何杯か、担当、状態、開始・終了時刻）。待機カードの予定時刻は画面で計算する。
 */
export interface Drip {
  id: string;
  /** unassigned：未割当 / queued：担当の待機列 / brewing：抽出中 / done：抽出終了 */
  status: 'unassigned' | 'queued' | 'brewing' | 'done';
  /** 担当のドリッパー（1〜6） */
  dripper: number | null;
  /** 待機列の並び順。ふだんは注文番号で、入れ直しのときだけ差し込む位置に合わせる */
  queue_pos: number;
  /** 中身の注文。統合したカードは 2 注文になる */
  order_ids: string[];
  lines: DripLine[];
  cups: number;
  /** 入れ直しのカードなら、元のカード */
  rebrew_of: string | null;
  /** 入れ直しのために途中でやめた抽出 */
  interrupted: boolean;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
  updated_at: string;
}

/** cafeore-pos の注文（GET /api/orders・WebSocket /api/ws/orders の OrderResponse）のうち、盤面が使うところ */
export interface PosOrder {
  id: string;
  order_id: number;
  created_at: string;
  ready_at: string | null;
  served_at: string | null;
  menus: {
    id: string;
    assignee: string | null;
    menu: {
      items: {
        quantity: number;
        item: { id: string; name: string; abbr: string; item_type: { name: string } };
      }[];
    };
  }[];
}

/** 操作の結果。呼んだ画面はこれですぐ反映し、「1つ戻す」に使う */
export interface OpResult {
  changed: Drip[];
  deleted: string[];
  /** この操作で準備完了にした注文 */
  readied: string[];
}

export type Op =
  | { name: 'assign'; drip_id: string; dripper: number }
  | { name: 'unassign'; drip_id: string }
  | { name: 'next'; dripper: number }
  | { name: 'merge'; first_id: string; second_id: string }
  | {
      name: 'rebrew';
      source_id: string;
      cups: number;
      interrupt: boolean;
      dripper: number | null;
      queue_pos: number | null;
    }
  | { name: 'restore'; before: Drip[]; after: Drip[]; readied: string[] };

/** 画面 → 盤面 */
export type ClientMessage =
  /** POS から受け取った注文。full は「その日の注文を全部送った」（載っていない注文は消えたとみなす） */
  | { t: 'orders'; orders: PosOrder[]; full: boolean }
  | { t: 'op'; rid: string; op: Op }
  /** 版が飛んだので全部送り直してほしい */
  | { t: 'sync' };

/** 盤面 → 画面 */
export type ServerMessage =
  | { t: 'snapshot'; v: number; day: string; drips: Drip[] }
  /** 変わったカード。v が 1 つずつ増える。飛んだら sync を送る */
  | { t: 'drips'; v: number; drips: Drip[]; deleted: string[] }
  | { t: 'reply'; rid: string; ok: true; result: OpResult }
  | { t: 'reply'; rid: string; ok: false; error: { code: 'invalid' | 'error'; message: string } };
