import type { BoardObject } from './board/BoardObject';

export interface Env {
  BOARD: DurableObjectNamespace<BoardObject>;
  ASSETS: Fetcher;
  /** cafeore-pos の API（準備完了を返す先） */
  POS_API_BASE_URL: string;
  /** 盤面の WebSocket をつないでよい、ほかの origin（開発用。カンマ区切り）。同じ origin はいつでもよい */
  ALLOWED_ORIGINS?: string;
}
