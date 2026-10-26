import {
  type CaosLane,
  dripperLabel,
  isSeniorName,
  laneCandidates,
} from "@cafeore/common";
import {
  ArrowLeftRight,
  KeyRound,
  RefreshCw,
  Trash2,
  UserMinus,
  UserRound,
  X,
} from "lucide-react";
import type React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePanelOutsidePress } from "../hooks/useOutsidePress";
import type { ShiftFeedProgress } from "../logic/shiftFeed";
type ShiftFeedState = ShiftFeedProgress;
import { gradeMembers } from "../logic/dripSupport";
import {
  type ShiftFeedTone,
  noCandidateReason,
  shiftFeedStatus,
  typedSeniorNote,
} from "../logic/shiftFeed";
import { useFloatingWindow } from "./FloatingWindows";
import { LaneName, SeniorMark } from "./LaneParts";

// ドリッパーの「交代」。sohosai-shift の予定（今の枠・次の枠・オペ練の今と次のラウンド）の、そのドリッパーの番目の人を候補に出す。
// 候補に無い人は自由に入れられ、空き（担当者なし）にもできる。ほかのドリッパーの担当者との入れ替えもここから。
// 押したらその場で替える（抽出中かどうかは見ない）。指名の無い上級生のみのカードがあるときの知らせ（POS の通知）は CaosLanesProvider が出す。

interface LaneChangeDialogProps {
  lane: CaosLane;
  lanes: CaosLane[];
  shiftFeed: ShiftFeedState;
  /** 開いたときの時刻（候補の枠を決める） */
  nowMs: number;
  onPick: (name: string, senior: boolean) => void;
  onSwap: (other: number) => void;
  onOpenSettings: () => void;
  onClose: () => void;
}

const PersonName: React.FC<{ lane: CaosLane }> = ({ lane }) =>
  lane.name ? (
    <LaneName dripper={lane.dripper} />
  ) : (
    <span className="text-slate-400">担当者なし</span>
  );

export const LaneChangeDialog: React.FC<LaneChangeDialogProps> = ({
  lane,
  lanes,
  shiftFeed,
  nowMs,
  onPick,
  onSwap,
  onOpenSettings,
  onClose,
}) => {
  const { feed } = shiftFeed;
  const [typed, setTyped] = useState("");
  const [grade, setGrade] = useState<string | null>(null);
  const members = useMemo(
    () => gradeMembers(feed, lane.name),
    [feed, lane.name],
  );
  const gradeOrder = ["B1", "B2", "B3", "B4", "M1", "M2", "D1", "D2", "D3"];
  const grades = [
    ...new Set(gradeMembers(feed, "").map((member) => member.grade)),
  ].sort((a, b) => {
    const position = (grade: string) =>
      gradeOrder.includes(grade) ? gradeOrder.indexOf(grade) : 100;
    return (
      position(a) - position(b) || a.localeCompare(b, "ja", { numeric: true })
    );
  });
  const selectedGrade = grade !== null && grades.includes(grade) ? grade : null;
  useEffect(() => {
    if (grade !== selectedGrade) setGrade(selectedGrade);
  }, [grade, selectedGrade]);
  // 後ろの幕を押すと閉じる（その 1 回は閉じるだけ。名前を打っているあいだは入力を終えるだけ）
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const floating = useFloatingWindow("担当者の交代");
  usePanelOutsidePress(dialogRef, onClose, !floating.hidden);
  const ordinal = dripperLabel(lane.dripper);
  const candidates = useMemo(
    () => laneCandidates(feed, lane.dripper, nowMs, lane.name),
    [feed, lane.dripper, nowMs, lane.name],
  );
  const shownCandidates =
    selectedGrade === null
      ? candidates
      : members
          .filter((member) => member.grade === selectedGrade)
          .map((member) => ({
            name: member.name,
            senior: isSeniorName(feed, member.name),
            reasons: [member.grade],
          }));
  const typedName = typed.trim();
  const typedSenior = isSeniorName(feed, typedName);

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-950/40 p-4"
      data-caos-backdrop
      data-popup-hidden={floating.hidden}
      style={floating.hidden ? { display: "none" } : undefined}
    >
      <dialog
        ref={(element) => {
          dialogRef.current = element;
          floating.ref.current = element;
        }}
        style={floating.style}
        open
        aria-modal="true"
        aria-label={`${ordinal} の交代`}
        className="static flex max-h-[calc(100vh-32px)] w-[min(600px,100%)] flex-col overflow-hidden rounded-2xl border-0 bg-white p-0 shadow-2xl"
      >
        <header className="flex items-center justify-between border-slate-200 border-b bg-slate-50 px-5 py-3">
          {floating.handle}
          <div className="min-w-0">
            <h2 className="font-black text-[18px] text-slate-950">
              {ordinal} の交代
            </h2>
            <div className="mt-0.5 flex items-center gap-1 font-bold text-[13px] text-slate-600">
              <span>今：</span>
              <PersonName lane={lane} />
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-11 w-11 touch-manipulation items-center justify-center rounded-full hover:bg-slate-200"
            aria-label="閉じる"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
          <section>
            <div className="mb-2 flex items-center justify-between gap-2">
              <h3 className="font-black text-[13px] text-slate-700">
                {selectedGrade === null
                  ? "シフトの予定から"
                  : `${selectedGrade}の候補`}
              </h3>
              <button
                type="button"
                onClick={onOpenSettings}
                className="flex min-h-[36px] touch-manipulation items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 font-bold text-[12px] text-slate-700"
              >
                <KeyRound className="h-3.5 w-3.5" />
                合言葉
              </button>
            </div>
            <div
              className="mb-3 flex flex-wrap gap-2"
              aria-label="候補者の学年"
            >
              {[null, ...grades].map((value) => (
                <button
                  key={value ?? "schedule"}
                  type="button"
                  aria-pressed={selectedGrade === value}
                  onClick={() => setGrade(value)}
                  className={`min-h-10 touch-manipulation rounded-lg border-2 px-3 font-bold text-xs ${selectedGrade === value ? "border-blue-700 bg-blue-700 text-white" : "border-slate-300 bg-white text-slate-700"}`}
                >
                  {value ?? "予定の候補"}
                </button>
              ))}
            </div>
            {!feed?.members && (
              <p className="mb-2 text-slate-500 text-xs">
                学年はシフト側で名簿を配信すると表示されます。
              </p>
            )}
            {shownCandidates.length > 0 ? (
              <div className="grid grid-cols-2 gap-2">
                {shownCandidates.map((candidate) => (
                  <button
                    key={candidate.name}
                    type="button"
                    data-lane-candidate={candidate.name}
                    onClick={() => onPick(candidate.name, candidate.senior)}
                    className="flex min-h-[56px] touch-manipulation flex-col items-start justify-center rounded-xl border-2 border-blue-500 bg-blue-50 px-3 py-2 text-left active:scale-[0.98]"
                  >
                    <span className="flex items-center gap-1.5 font-black text-[16px] text-slate-950">
                      <UserRound className="h-4 w-4 shrink-0 text-slate-500" />
                      {candidate.name}
                      {candidate.senior && <SeniorMark />}
                    </span>
                    <span className="mt-0.5 font-bold text-[11px] text-slate-500 leading-snug">
                      {candidate.reasons.join("・")}
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="rounded-lg border border-slate-200 bg-slate-50 p-3 font-bold text-[12px] text-slate-500">
                {selectedGrade === null
                  ? noCandidateReason(shiftFeed)
                  : "この学年の候補者はいません。"}
              </p>
            )}
          </section>

          <section>
            <h3 className="mb-2 font-black text-[13px] text-slate-700">
              名前を入れる
            </h3>
            <form
              className="flex gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                if (typedName) onPick(typedName, typedSenior);
              }}
            >
              <input
                type="text"
                value={typed}
                maxLength={40}
                onChange={(event) => setTyped(event.target.value)}
                placeholder="氏名"
                aria-label="担当者の名前"
                className="min-h-[48px] min-w-0 flex-1 rounded-lg border-2 border-slate-300 px-3 font-bold text-[16px] focus:border-blue-500 focus:outline-none"
              />
              <button
                type="submit"
                disabled={!typedName}
                className="min-h-[48px] shrink-0 touch-manipulation rounded-lg bg-slate-950 px-4 font-black text-[14px] text-white disabled:bg-slate-300"
              >
                この名前にする
              </button>
            </form>
            {typedName && (
              <p className="mt-1.5 font-bold text-[12px] text-slate-500">
                {typedSeniorNote(typedSenior, feed)}
              </p>
            )}
          </section>

          <section>
            <h3 className="mb-2 font-black text-[13px] text-slate-700">
              ほかのドリッパーの担当者と入れ替える
            </h3>
            <div className="grid grid-cols-3 gap-2">
              {lanes
                .filter((other) => other.dripper !== lane.dripper)
                .map((other) => (
                  <button
                    key={other.dripper}
                    type="button"
                    data-lane-swap={other.dripper}
                    onClick={() => onSwap(other.dripper)}
                    className="flex min-h-[48px] touch-manipulation items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2 text-left font-bold text-[13px] text-slate-800 active:scale-[0.98]"
                  >
                    <ArrowLeftRight className="h-4 w-4 shrink-0 text-slate-500" />
                    <span className="shrink-0 font-black font-mono">
                      {dripperLabel(other.dripper)}
                    </span>
                    <PersonName lane={other} />
                  </button>
                ))}
            </div>
          </section>
        </div>

        <footer className="flex items-center justify-between gap-2 border-slate-200 border-t bg-slate-50 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] touch-manipulation rounded-lg border border-slate-300 bg-white px-4 font-bold text-[13px] text-slate-700"
          >
            やめる
          </button>
          <button
            type="button"
            disabled={!lane.name}
            onClick={() => onPick("", false)}
            className="flex min-h-[44px] touch-manipulation items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 font-black text-[13px] text-slate-800 disabled:text-slate-300"
          >
            <UserMinus className="h-4 w-4" />
            空きにする
          </button>
        </footer>
      </dialog>
    </div>
  );
};
