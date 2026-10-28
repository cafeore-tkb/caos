import { z } from 'zod';
import type { CupResult, GameState } from './engine';

export type ScoreCategoryId = 'completion' | 'speed' | 'quality' | 'together' | 'ice';
export interface ReviewMoment {
  atSec: number;
  label: string;
  kind: 'actual' | 'forecast' | 'target';
}
export interface ScoreDeduction {
  id: string;
  category: string;
  points: number;
  orderIds: number[];
  cupIds: string[];
  items?: string[];
  reason: string;
  advice: string;
  timeline: ReviewMoment[];
}
export interface ScoreReview {
  deductions: ScoreDeduction[];
  gates: { reason: string; orderIds: number[] }[];
  basePoints: number;
  categoryLoss: number;
  penaltyPoints: number;
  minimumAdjustment: number;
  roundingAdjustment: number;
  capPoints: number;
  score: number;
}
const nonnegative = z.number().finite().nonnegative();
const ids = z.array(z.number().int().positive());
const reviewSchema = z.object({
  deductions: z.array(
    z.object({
      id: z.string(),
      category: z.string(),
      points: nonnegative,
      orderIds: ids,
      cupIds: z.array(z.string()),
      items: z.array(z.string()).optional(),
      reason: z.string(),
      advice: z.string(),
      timeline: z.array(
        z.object({ atSec: nonnegative, label: z.string(), kind: z.enum(['actual', 'forecast', 'target']) })
      ),
    })
  ),
  gates: z.array(z.object({ reason: z.string(), orderIds: ids })),
  basePoints: nonnegative,
  categoryLoss: nonnegative,
  penaltyPoints: nonnegative,
  minimumAdjustment: nonnegative,
  roundingAdjustment: z.number().finite(),
  capPoints: nonnegative,
  score: nonnegative,
});
export const isScoreReview = (value: unknown): value is ScoreReview => reviewSchema.safeParse(value).success;
type Category = { id: ScoreCategoryId; label: string; points: number; max: number };
const quality = (cup: CupResult) => cup.completedSec !== undefined && (cup.brewRatio ?? 0) >= 0.9;
export const reviewClock = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;
const orderIds = (cups: CupResult[]) => [...new Set(cups.map((cup) => cup.orderId))].sort((a, b) => a - b);

/** Explain the existing score from the same cup records and events used by the replay. */
export function buildScoreReview(
  state: GameState,
  cups: CupResult[],
  input: {
    categories: Category[];
    forecastMode: boolean;
    targetSec: number;
    penalties: number;
    raw: number;
    score: number;
    emergencyPending: number;
  }
): ScoreReview {
  const deductions: ScoreDeduction[] = [];
  const actualCups = state.cups;
  const done = cups.filter((cup) => cup.completedSec !== undefined);
  const good = cups.filter(quality);
  const incomplete = cups.filter((cup) => cup.completedSec === undefined);
  const short = done.filter((cup) => !quality(cup));
  const categories = new Map(input.categories.map((category) => [category.id, category]));
  const current = new Map(
    state.bays.flatMap((bay) =>
      bay.queue.flatMap((ticket) => (ticket.trainingCupIds ?? []).map((id) => [id, { ticket, bayId: bay.id }] as const))
    )
  );
  const loss = (id: ScoreCategoryId) => {
    const category = categories.get(id);
    return category ? Math.max(0, category.max - category.points) : 0;
  };
  const moments = (affected: CupResult[]): ReviewMoment[] => {
    const ids = new Set(affected.map((cup) => cup.id));
    const starts = [...new Set(affected.map((cup) => cup.arrivedSec))].map((atSec) => ({
      atSec,
      label: atSec > state.nowSec ? '注文が届く予定' : '注文が届いた',
      kind: atSec > state.nowSec ? ('target' as const) : ('actual' as const),
    }));
    const events = state.events
      .filter((event) => event.cupIds?.some((id) => ids.has(id)))
      .map((event) => ({
        atSec: event.atSec,
        label: event.message,
        kind: 'actual' as const,
      }));
    const brewStarts = affected.flatMap((cup) => {
      const ticket = current.get(cup.id)?.ticket;
      const started =
        cup.startedSec ??
        (ticket?.status === 'brewing'
          ? Math.max(ticket.startTimeSec ?? state.nowSec, cup.joinedAtSec ?? 0)
          : undefined);
      return started === undefined
        ? []
        : [
            {
              atSec: started,
              label: cup.joinedAtSec !== undefined ? '途中で加えたカップの抽出開始' : '抽出開始',
              kind: started > state.nowSec ? ('forecast' as const) : ('actual' as const),
            },
          ];
    });
    const ends = affected.flatMap((cup) =>
      cup.completedSec === undefined
        ? []
        : [
            {
              atSec: cup.completedSec,
              label: actualCups[cup.id]?.completedSec === undefined ? '抽出が終わる見込み' : '抽出を終えた',
              kind: actualCups[cup.id]?.completedSec === undefined ? ('forecast' as const) : ('actual' as const),
            },
          ]
    );
    return [...starts, ...events, ...brewStarts, ...ends]
      .sort((a, b) => a.atSec - b.atSec)
      .filter(
        (moment, index, list) =>
          !list.slice(0, index).some((other) => other.atSec === moment.atSec && other.label === moment.label)
      );
  };
  const add = (
    id: ScoreCategoryId,
    affected: CupResult[],
    points: number,
    reason: string,
    advice: string,
    extra: ReviewMoment[] = []
  ) => {
    const category = categories.get(id);
    if (points <= 1e-9 || !category) return;
    deductions.push({
      id: `${id}-${deductions.length}`,
      category: category.label,
      points,
      orderIds: orderIds(affected),
      cupIds: affected.map((cup) => cup.id),
      reason,
      advice,
      items: [...new Set(affected.map((cup) => cup.name))],
      timeline: [...moments(affected), ...extra].sort((a, b) => a.atSec - b.atSec),
    });
  };
  const missingReason = (cup: CupResult) => {
    if (cup.arrivedSec > state.nowSec) return 'この注文が届く前に採点しました。まだ抽出できていません。';
    const active = current.get(cup.id);
    if (!active) return '担当が決まっていないため、このカップを仕上げられていません。';
    if (active.ticket.status !== 'brewing') return `${active.bayId}番で順番を待っていて、まだ抽出を終えていません。`;
    return (active.ticket.timeRemainingSec ?? 1) <= 0
      ? `${active.bayId}番で予定の抽出時間は過ぎましたが、「終える」を押していません。`
      : `${active.bayId}番で抽出中です。採点した時点ではまだ終わっていません。`;
  };
  const missingAdvice = (cup: CupResult) => {
    if (cup.arrivedSec > state.nowSec) return '残りの注文が届いてから、すべての抽出を終えて採点しましょう。';
    const active = current.get(cup.id);
    if (!active) return '空いている担当を選び、このカップを割り当てましょう。';
    if (active.ticket.status !== 'brewing')
      return '前の抽出を終えたら次を始めましょう。待ち列が長ければ、空いている担当へ移せます。';
    return '残り時間を見て、0秒になったら「終える」を押しましょう。採点の前に完了を確認します。';
  };
  for (const cup of incomplete)
    add('completion', [cup], loss('completion') / incomplete.length, missingReason(cup), missingAdvice(cup));
  const notGood = cups.filter((cup) => !quality(cup));
  for (const cup of notGood) {
    const elapsed =
      cup.completedSec !== undefined && cup.startedSec !== undefined ? cup.completedSec - cup.startedSec : null;
    const needed = cup.requiredBrewSec !== undefined ? Math.ceil(cup.requiredBrewSec * 0.9) : null;
    add(
      'quality',
      [cup],
      loss('quality') / notGood.length,
      cup.completedSec === undefined
        ? missingReason(cup)
        : `抽出を予定時間の${Math.round((cup.brewRatio ?? 0) * 100)}%で終えました。${elapsed !== null && needed !== null ? `${elapsed}秒で終了し、合格には${needed}秒必要でした。` : '合格には90%以上の時間が必要です。'}`,
      cup.completedSec === undefined
        ? missingAdvice(cup)
        : cup.joinedAtSec !== undefined
          ? '途中で足したカップは、追加した時点から抽出時間を数えます。早い段階でまとめるか、別の担当へ回しましょう。'
          : '残り時間が0秒になってから「終える」を押すと、抽出時間を確保できます。'
    );
  }
  if (input.forecastMode) {
    const end = done.length ? Math.max(...done.map((cup) => cup.completedSec ?? 0)) : null;
    const tail = end === null ? cups : done.filter((cup) => cup.completedSec === end);
    add(
      'speed',
      tail,
      loss('speed'),
      end === null
        ? '担当が決まったカップがなく、完了時刻を予測できません。'
        : `最後に終わるのはこの注文です。完了見込み${reviewClock(end)}は、満点の目安${reviewClock(input.targetSec)}より${reviewClock(Math.max(0, end - input.targetSec))}遅れています。`,
      '最後まで待ち列が続く担当から、空いている担当へ注文を移しましょう。同じ商品は2杯ずつまとめられます。',
      [{ atSec: input.targetSec, label: '完了の速さが満点になる目安', kind: 'target' }]
    );
  } else {
    const notTimely = cups.filter((cup) => !quality(cup) || (cup.completedSec ?? 0) - cup.arrivedSec > 480);
    for (const cup of notTimely)
      add(
        'speed',
        [cup],
        loss('speed') / notTimely.length,
        cup.completedSec === undefined
          ? missingReason(cup)
          : !quality(cup)
            ? '抽出時間が短いため、8分以内に終えていても速さの点には入りません。'
            : `注文から終了まで${reviewClock(cup.completedSec - cup.arrivedSec)}かかり、8分の目標を${reviewClock(cup.completedSec - cup.arrivedSec - 480)}超えました。`,
        cup.completedSec === undefined
          ? missingAdvice(cup)
          : !quality(cup)
            ? '抽出時間を守ったうえで、注文から8分以内の仕上がりを目指しましょう。'
            : '古い注文を先に割り当てましょう。待ち列が長い場合は、空いている担当へ移せます。',
        [{ atSec: cup.arrivedSec + 480, label: '注文から8分の目標', kind: 'target' }]
      );
  }
  const groups = new Map<number, CupResult[]>();
  for (const cup of cups) groups.set(cup.orderId, [...(groups.get(cup.orderId) ?? []), cup]);
  const apart = [...groups.values()].filter(
    (group) =>
      !group.every(quality) ||
      Math.max(...group.map((cup) => cup.completedSec ?? 0)) - Math.min(...group.map((cup) => cup.completedSec ?? 0)) >
        60
  );
  for (const group of apart) {
    const allGood = group.every(quality);
    const gap = allGood
      ? Math.max(...group.map((cup) => cup.completedSec ?? 0)) - Math.min(...group.map((cup) => cup.completedSec ?? 0))
      : null;
    add(
      'together',
      group,
      loss('together') / apart.length,
      gap !== null
        ? `同じ注文の仕上がりに${reviewClock(gap)}の差があります。満点は60秒以内です。`
        : '同じ注文の全カップを、抽出時間を守って仕上げられていません。',
      gap !== null
        ? '同じ注文のカードを並行して淹れましょう。残り時間を見て、仕上がりを60秒以内にそろえます。'
        : 'まず、この注文でまだ終わっていないカップと、早く終えすぎたカップを確認しましょう。'
    );
  }
  const ice = done.filter((cup) => cup.iceDecision?.opportunity);
  const offSenior = ice.filter((cup) => !cup.iceDecision?.senior);
  for (const cup of offSenior)
    add(
      'ice',
      [cup],
      loss('ice') / offSenior.length,
      `アイス1杯を${cup.iceDecision?.bayId ?? cup.completedBayId ?? ''}番へ割り当てました。この時点では、待ち時間の差が60秒以内の上級生がいました。`,
      'アイス1杯は、待ち時間の差が60秒以内なら★の担当へ。指名や2杯抽出はこの採点の対象外です。'
    );
  for (const category of input.categories) {
    if (loss(category.id) > 1e-9 && !deductions.some((row) => row.category === category.label))
      add(
        category.id,
        cups,
        loss(category.id),
        '抽出が終わったカップがなく、この項目を評価できません。',
        'まず担当を決め、抽出時間を守ってカップを仕上げましょう。'
      );
  }
  let penaltyLeft = input.penalties;
  for (const event of state.events.filter((event) => event.kind === 'rejected')) {
    const points = Math.min(2, penaltyLeft);
    if (!points) break;
    deductions.push({
      id: `rule-${event.id}`,
      category: '割り当て条件',
      points,
      orderIds: event.orderIds ?? [],
      cupIds: event.cupIds ?? [],
      reason: event.message,
      advice: '指名は指定された番号へ、限定豆は★の担当へ割り当てましょう。',
      timeline: [{ atSec: event.atSec, label: `${event.bayId ?? ''}番への操作を受け付けませんでした`, kind: 'actual' }],
    });
    penaltyLeft -= points;
  }
  if (penaltyLeft > 0)
    deductions.push({
      id: 'rule-unrecorded',
      category: '割り当て条件',
      points: penaltyLeft,
      orderIds: [],
      cupIds: [],
      reason: '割り当て条件に合わない操作がありました。',
      advice: '指名の番号と★を確認しましょう。',
      timeline: [],
    });
  const gates: ScoreReview['gates'] = [];
  if (!cups.length || done.length / cups.length < 0.9)
    gates.push({
      reason: `${input.forecastMode ? '完了を見込める杯数' : '抽出が終わった杯数'}は${done.length}/${cups.length}杯です。80点以上には90%以上の完了が必要です。`,
      orderIds: orderIds(incomplete),
    });
  if (!done.length || good.length / done.length < 0.95)
    gates.push({
      reason: `${input.forecastMode ? '完了を見込む' : '終えた'}${done.length}杯のうち、抽出時間を守った${input.forecastMode ? '見込みなのは' : 'のは'}${good.length}杯です。80点以上には95%以上が必要です。`,
      orderIds: orderIds(short),
    });
  if (state.violations)
    gates.push({
      reason: `割り当て条件に合わない操作が${state.violations}回ありました。80点以上には0回が必要です。`,
      orderIds: [...new Set(state.events.filter((e) => e.kind === 'rejected').flatMap((e) => e.orderIds ?? []))],
    });
  if (input.emergencyPending)
    gates.push({
      reason: `緊急の淹れ直しが${input.emergencyPending}件終わっていません。80点以上には全件の完了が必要です。`,
      orderIds: orderIds(
        cups.filter((cup) =>
          state.emergencies.some(
            (trial) =>
              trial.cupId === cup.id &&
              (trial.status === 'pending' || (trial.status === 'rebrewing' && !(input.forecastMode && quality(cup))))
          )
        )
      ),
    });
  if (ice.length && offSenior.length > ice.length / 2)
    gates.push({
      reason: `対象のアイス${ice.length}杯のうち、上級生に任せたのは${ice.length - offSenior.length}杯です。80点以上には半数以上が必要です。`,
      orderIds: orderIds(offSenior),
    });
  const basePoints = input.categories.reduce((sum, category) => sum + category.points, 0);
  return {
    deductions: deductions.sort((a, b) => b.points - a.points || a.id.localeCompare(b.id)),
    gates,
    basePoints,
    categoryLoss: 100 - basePoints,
    penaltyPoints: input.penalties,
    minimumAdjustment: Math.max(0, input.penalties - basePoints),
    roundingAdjustment: input.raw - Math.max(0, basePoints - input.penalties),
    capPoints: input.raw - input.score,
    score: input.score,
  };
}
