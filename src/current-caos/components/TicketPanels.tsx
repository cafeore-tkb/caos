import { type CaosCard, type CaosOrderInput, type CaosPlace, DRIPPER_NUMBERS, canSplitCard, dripperLabel } from "../common";
import { ArrowRight, Undo2 } from "lucide-react";
import type React from "react";
import { TwoStepButton } from "../bridge/ui";
import { SidePanel } from "../bridge/SidePanel";
import { type CardLook, orderCount } from "../logic/cards";
import { type Lane, frontTargets, moveTargets } from "../logic/lanes";
import { OrderCard, SplitCupButtons } from "./OrderCard";
import { LaneAbility, LaneChangeButton } from "./LaneParts";
import { CommentList } from "./OrderComments";
import { EmergencyForm, type EmergencyFormProps } from "./EmergencyForm";

/** カードを動かす操作（待機の詳細と、抽出中のカードの緊急のパネルで共通） */
type MoveActions = {
  onMoveTicket: (card: CaosCard, bayId: number, place?: CaosPlace) => void;
  onReturnToUnassigned: (card: CaosCard) => void;
};

// 待機・抽出中のカードを別のドリッパーへ（番号。今のドリッパーでも列の最後へ）・今のドリッパーの先頭へ（今から始める）・
// 待機の先頭へ（抽出中の次。logic/lanes の frontTargets）・未割当に戻す。押したら onDone
const MoveCardButtons: React.FC<
  MoveActions & {
    card: CaosCard;
    /** カードの今のドリッパーの列 */
    lane?: Lane;
    onDone: () => void;
  }
> = ({ card, lane, onMoveTicket, onReturnToUnassigned, onDone }) => {
  const move = (bayId: number, place?: CaosPlace) => {
    onMoveTicket(card, bayId, place);
    onDone();
  };
  return (
    <>
      <h3 className="mt-5 mb-2 font-black text-[14px] text-slate-700">
        ドリッパーへ移す（列の最後へ）
      </h3>
      <div className="grid grid-cols-3 gap-2">
        {moveTargets(card, lane?.id ?? null).map(
          ({ bayId, current, disabled }) => (
            <button
              key={bayId}
              type="button"
              disabled={disabled}
              data-tour-move={bayId}
              onClick={() => move(bayId)}
              className="h-16 touch-manipulation rounded-xl border-2 border-slate-300 bg-white font-black font-mono text-[24px] active:bg-slate-900 active:text-white disabled:opacity-30"
            >
              {current ? `${bayId} 最後へ` : bayId}
            </button>
          ),
        )}
      </div>
      {lane && (
        <>
          <h3 className="mt-4 mb-2 font-black text-[14px] text-slate-700">
            {dripperLabel(lane.id)} の中で動かす
          </h3>
          <div className="grid grid-cols-2 gap-2">
            {frontTargets(card, lane).map(
              ({ bayId, place, label, hint, disabled }) => (
                <button
                  key={place}
                  type="button"
                  disabled={disabled}
                  onClick={() => move(bayId, place)}
                  className="flex h-16 touch-manipulation flex-col items-center justify-center rounded-xl border-2 border-amber-300 bg-amber-50 font-black text-[18px] text-amber-950 active:bg-amber-900 active:text-white disabled:opacity-30"
                >
                  {label}
                  {hint && (
                    <span className="font-bold text-[12px]">（{hint}）</span>
                  )}
                </button>
              ),
            )}
          </div>
        </>
      )}
      <button
        type="button"
        onClick={() => {
          onReturnToUnassigned(card);
          onDone();
        }}
        className="mt-5 flex min-h-[60px] w-full touch-manipulation items-center justify-center gap-2 rounded-xl border-2 border-red-200 bg-red-50 px-4 font-black text-[16px] text-red-700 active:bg-red-100"
      >
        <Undo2 className="h-5 w-5" />
        未割り当に戻す
      </button>
    </>
  );
};

// 待機のカードの詳細（管制盤 C）。別のドリッパーへ・先頭へ・待機の先頭へ・未割当に戻す・統合の解除（統合したカードの 1 杯を外す）・
// 淹れ直し（緊急）の取り消し。
// パネルの外を押すと閉じる
export const TicketDetailPanel: React.FC<
  MoveActions & {
    ticket: CaosCard;
    look?: CardLook;
    /** カードの今のドリッパーの列 */
    lane?: Lane;
    onClose: () => void;
    onSplitCup: (card: CaosCard, cupId: string) => void;
    /** 淹れ直しのカードなら「緊急を取り消す」を出す（渡したときだけ） */
    onCancelEmergency?: (card: CaosCard) => void;
  }
> = ({
  ticket,
  look,
  lane,
  onClose,
  onMoveTicket,
  onReturnToUnassigned,
  onSplitCup,
  onCancelEmergency,
}) => (
  <SidePanel title="未開始オーダーの移動" onClose={onClose}>
    <OrderCard card={ticket} look={look} size="xl" />
    <CommentList comments={look?.comments} className="mt-3" />
    <MoveCardButtons
      card={ticket}
      lane={lane}
      onMoveTicket={onMoveTicket}
      onReturnToUnassigned={onReturnToUnassigned}
      onDone={onClose}
    />
    {canSplitCard(ticket) && (
      <>
        <h3 className="mt-5 mb-2 font-black text-[14px] text-slate-700">
          統合を解除（外した 1 杯は未割当へ）
        </h3>
        <SplitCupButtons
          card={ticket}
          onSplit={(cupId) => {
            onSplitCup(ticket, cupId);
            onClose();
          }}
          className="grid grid-cols-2"
        />
      </>
    )}
    {ticket.emergency && onCancelEmergency && (
      <TwoStepButton
        label="緊急を取り消す"
        confirmLabel="もう一度押すと緊急を取り消す"
        onConfirm={() => {
          onCancelEmergency(ticket);
          onClose();
        }}
        className="mt-3 h-12 font-black text-base"
      />
    )}
    <p className="mt-5 flex items-center gap-2 rounded-lg bg-slate-100 p-3 font-bold text-[13px] text-slate-500">
      <ArrowRight className="h-4 w-4" />
      抽出中のカードは、長押しで開く緊急のパネルから移せます
    </p>
  </SidePanel>
);

// 緊急（淹れ直し）の入力（マスターと同じ EmergencyForm）。抽出中・終わりのカードから開けば、そのカードのカップを全部選んでおく
// （注文をまたいで統合したカードは、番号は先頭のカップの注文で、ほかの注文のカップも選べる。外せば一部だけ）。ヘッダーから開けば番号から入れる。
// 確定すると、未割当のいちばん上に淹れ直しのカードが出て（統合したカードの全部の杯なら、元のカードと同じ組み合わせの 1 枚）、緊急のシールとそのカップのシール（レジで刷るのと同じもの）をこの端末から刷る（実データテスト中は刷らない）。
// 抽出中のカードから開いたときは、そのカードを 1〜6 に移す・未割当に戻すも出す。パネルの外を押すと閉じる
export const RebrewPanel: React.FC<
  Omit<EmergencyFormProps<CaosOrderInput>, "initial" | "onDone"> & {
    card?: CaosCard;
    look?: CardLook;
    /** 抽出中のカードの今のドリッパーの列（移すボタンに使う） */
    lane?: Lane;
    onClose: () => void;
    move: MoveActions;
  }
> = ({ card, look, lane, onClose, move, ...form }) => {
  const first = card?.cups[0];
  return (
    <SidePanel title="緊急（淹れ直し）" onClose={onClose}>
      {card && (
        <div className="mb-4">
          <OrderCard card={card} look={look} size="xl" />
          <CommentList comments={look?.comments} className="mt-3" />
        </div>
      )}
      <EmergencyForm
        {...form}
        initial={
          first && {
            orderNo: first.orderNo,
            cupIds: card.cups.map((cup) => cup.cupId),
          }
        }
        onDone={onClose}
      />
      {card?.status === "brewing" && (
        <MoveCardButtons card={card} lane={lane} {...move} onDone={onClose} />
      )}
    </SidePanel>
  );
};

// 列の操作（管制盤 A・C のドリッパーの番号を押して開く）。担当者の交代と、この列の待機を全部別のドリッパーへ移す（並びのまま最後へ）。
// パネルの外を押すと閉じる
export const LanePanel: React.FC<{
  lane: Lane;
  onClose: () => void;
  onMoveQueue: (from: number, to: number) => void;
}> = ({ lane, onClose, onMoveQueue }) => (
  <SidePanel title={`ドリッパー ${dripperLabel(lane.id)}`} onClose={onClose}>
    <div className="flex items-center gap-2">
      <LaneAbility dripper={lane.id} />
      <LaneChangeButton dripper={lane.id} className="font-black text-[18px]" />
    </div>
    <h3 className="mt-5 mb-2 font-black text-[14px] text-slate-700">
      この列の待機 {orderCount(lane.queued)}件を移す
    </h3>
    <div className="grid grid-cols-3 gap-2">
      {DRIPPER_NUMBERS.map((to) => (
        <button
          key={to}
          type="button"
          disabled={to === lane.id || lane.queued.length === 0}
          data-move-queue={`${lane.id}-${to}`}
          onClick={() => {
            onMoveQueue(lane.id, to);
            onClose();
          }}
          className="h-16 touch-manipulation rounded-xl border-2 border-slate-300 bg-white font-black font-mono text-[24px] active:bg-slate-900 active:text-white disabled:opacity-30"
        >
          {to}
        </button>
      ))}
    </div>
  </SidePanel>
);
