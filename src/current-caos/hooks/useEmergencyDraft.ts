import { type CaosOrderInput, cupNeedsBrew } from "../common";
import { useState } from "react";
export type EmergencyCup<O extends CaosOrderInput> = { order: O; cupId: string };

/** 注文の抽出が要るカップ（表示の値つき。緊急で淹れ直せるカップ）。指名は明細のもの */
const brewCupsOf = <O extends CaosOrderInput>(order: O) =>
  order.cups.filter(cupNeedsBrew).map((cup) => {
    const menu = order.menus.find((m) => m.orderMenuId === cup.orderMenuId);
    return {
      order,
      cupId: cup.id,
      abbr: cup.item.abbr,
      name: cup.item.name,
      dripper: menu?.dripper ?? null,
      assignee: menu?.assignee ?? null,
    };
  });

/** 注文番号（入れた文字。数で比べるので「012」でもよい）の注文。同じ番号が複数あれば新しいもの */
export const orderByNo = <O extends CaosOrderInput>(
  orders: readonly O[],
  orderNo: string,
) => {
  const no = /^\d+$/.test(orderNo.trim()) ? Number(orderNo) : Number.NaN;
  return orders
    .filter((order) => order.orderId === no)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
};

/** 緊急の入力を開いたときの値（カップやカードから開けば、その注文番号とカップ） */
export type EmergencyInitial = { orderNo: number; cupIds: string[] };

/**
 * 緊急の入力：注文番号・淹れ直すカップ・理由。initial はカップやカードから開いたときの注文番号とカップ。
 * 淹れ直せるのは番号の注文の抽出が要るカップと、initial のカップのあるほかの注文（注文をまたいで統合したカード）の抽出が要るカップ。
 * 番号を変えると、ほかの注文は外し、その注文の抽出が要るカップが 1 杯ならそれを選び、ほかは選び直す。
 * 注文は POS の注文（OrderEntity）か、実データテストの練習の盤面の注文
 */
export const useEmergencyDraft = <O extends CaosOrderInput>(
  orders: readonly O[],
  initial?: EmergencyInitial,
) => {
  const [orderNo, setOrderNo] = useState(
    initial ? String(initial.orderNo) : "",
  );
  const [picked, setPicked] = useState(initial?.cupIds ?? []);
  // ほかの注文を探すカップ（番号を変えたら空）
  const [withCups, setWithCups] = useState(initial?.cupIds ?? []);
  const [reason, setReason] = useState("");
  const order = orderByNo(orders, orderNo);
  const scope = order
    ? [
        order,
        ...orders.filter(
          (other) =>
            other !== order &&
            other.cups.some((cup) => withCups.includes(cup.id)),
        ),
      ]
    : [];
  const cups = scope.flatMap(brewCupsOf);
  return {
    orderNo,
    changeOrderNo: (value: string) => {
      setOrderNo(value);
      setWithCups([]);
      const next = orderByNo(orders, value);
      const nextCups = next ? brewCupsOf(next) : [];
      setPicked(nextCups.length === 1 ? [nextCups[0].cupId] : []);
    },
    /** 番号の注文（無ければ undefined） */
    order,
    /** 淹れ直せるカップ（注文つき。番号の注文のカップが先） */
    cups,
    /** ほかの注文のカップも淹れ直せるか（カップに注文番号を添える） */
    manyOrders: scope.length > 1,
    picked,
    toggle: (cupId: string) =>
      setPicked((ids) =>
        ids.includes(cupId)
          ? ids.filter((id) => id !== cupId)
          : [...ids, cupId],
      ),
    reason,
    setReason,
    /** 淹れ直すカップ（addEmergency に渡す。理由は reason） */
    selected: cups
      .filter((cup) => picked.includes(cup.cupId))
      .map((cup): EmergencyCup<O> => ({ order: cup.order, cupId: cup.cupId })),
  };
};
