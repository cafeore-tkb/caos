import type { ControlViewProps } from '../../components/ControlWorkspace';
import { itemAbbr, itemType, masterColor, seniorOnly } from '../../training/master';
import type { OrderTicket, UnassignedOrder } from '../../types';
import type { CaosBoardCup, CaosCard } from '../common';
import type { CardLooks } from '../logic/cards';
import { type CommentsByOrder, cardComments } from '../logic/comments';
import { boardLanes, cardPlaces } from '../logic/lanes';
import type { UnfinishedOrder } from '../logic/unfinished';

type CardInput = OrderTicket | UnassignedOrder;
const keyOf = (card: CardInput) => card.ticketUid ?? card.id;
export function convertBoard(props: ControlViewProps, firstSeen = new Map<string, number>()) {
  const epoch = props.clockOriginMs ?? Math.floor((Date.now() + 9 * 3600000) / 86400000) * 86400000 - 9 * 3600000;
  const nowMs = epoch + props.currentTimeSec * 1000;
  const originals = new Map<string, CardInput>();
  const commentsByOrder: CommentsByOrder = new Map(
    [...new Set(props.orderComments?.map((comment) => comment.orderId) ?? [])].map((id) => [
      id,
      props.orderComments?.filter((comment) => comment.orderId === id) ?? [],
    ])
  );
  const convert = (input: CardInput, bayId: number | null, position: number): CaosCard => {
    const key = keyOf(input);
    originals.set(key, input);
    if (!firstSeen.has(key)) firstSeen.set(key, props.currentTimeSec);
    const ticket = 'status' in input ? input : null;
    const status =
      bayId === null
        ? 'unassigned'
        : ticket?.status === 'completed'
          ? 'done'
          : ticket?.status === 'brewing'
            ? 'brewing'
            : 'queued';
    const startedAt =
      ticket?.status === 'brewing' || ticket?.status === 'completed'
        ? new Date(epoch + (ticket.startTimeSec ?? props.currentTimeSec) * 1000)
        : null;
    const finishedAt =
      status === 'done'
        ? new Date(epoch + (ticket?.completedAtSec ?? ticket?.endTimeSec ?? props.currentTimeSec) * 1000)
        : null;
    const state = {
      dripper: bayId,
      dripperPosition: bayId === null ? null : position,
      dripId: bayId === null ? null : key,
      brewStartedAt: startedAt,
      brewFinishedAt: finishedAt,
    };
    const ids = input.sourceOrderIds ?? [input.id];
    const type = itemType(input.beanName) ?? {
      name: 'coffee',
      display_name: 'コーヒー',
      makes_cup: true,
      needs_brew: true,
      senior_only: input.beanCode === 'SP',
      iced_brew: input.beanCode === 'ICE' || input.beanCode === 'MILK',
    };
    const cups: CaosBoardCup[] = Array.from({ length: input.cupCount }, (_, index) => {
      const sourceCup = input.sourceCups?.[index];
      const orderId = sourceCup?.orderId ?? ids[Math.min(index, ids.length - 1)];
      const id = sourceCup?.id ?? input.trainingCupIds?.[index] ?? `${key}:${index}`;
      return {
        id,
        cupId: id,
        orderId,
        orderNo: Number(orderId.replace(/\D/g, '')),
        position: (input.itemIndex ?? 0) * 10 + index,
        emergency: Boolean(input.isRebrew),
        emergencyReason: input.isRebrew ? '入れ直し' : '',
        orderedAt: new Date(
          epoch + (sourceCup?.orderedAtSec ?? input.orderedAtSec ?? firstSeen.get(key) ?? props.currentTimeSec) * 1000
        ),
        item: {
          id: input.beanName,
          name: input.beanName,
          abbr: itemAbbr(input.beanName),
          item_type: { ...type, id: type.name },
        },
        nominatedDripper: input.preferredBaristaId ?? null,
        nominee: input.preferredBaristaId
          ? `${input.preferredBaristaId}${input.preferredBaristaId === 1 ? 'st' : input.preferredBaristaId === 2 ? 'nd' : input.preferredBaristaId === 3 ? 'rd' : 'th'}`
          : null,
        readyAt: null,
        servedAt: null,
        state,
      };
    });
    return {
      key,
      dripId: state.dripId,
      dripper: bayId,
      dripperPosition: state.dripperPosition,
      status,
      startedAt,
      finishedAt,
      cups,
      orderNo: Math.min(...cups.map((cup) => cup.orderNo)),
      nominatedDripper: input.preferredBaristaId ?? null,
      seniorOnly: seniorOnly(input.beanName) || type.senior_only,
      emergency: Boolean(input.isRebrew),
      state,
    };
  };
  const cards = [
    ...props.unassignedOrders.map((card) => convert(card, null, 0)),
    ...props.baristas.flatMap((bay) => [
      ...(bay.pastTickets ?? []).filter((card) => !card.isInterrupted).map((card) => convert(card, bay.id, 0)),
      ...bay.queue.map((card, index) => convert(card, bay.id, index + 1)),
    ]),
  ];
  const lanes = boardLanes(cards);
  const looks: CardLooks = new Map(
    cards.map((card) => [
      card.key,
      {
        comments: cardComments(card, commentsByOrder),
        color: masterColor(card.cups[0].item.name, card.nominatedDripper !== null),
        offSenior:
          card.seniorOnly &&
          card.dripper !== null &&
          !props.baristas.find((bay) => bay.id === card.dripper)?.canHandleSpecial,
      },
    ])
  );
  const places = cardPlaces(lanes);
  const groups = new Map<number, CaosCard[]>();
  for (const card of cards)
    for (const no of new Set(card.cups.map((cup) => cup.orderNo))) groups.set(no, [...(groups.get(no) ?? []), card]);
  const rows: UnfinishedOrder[] = [...groups]
    .filter(([, entries]) => entries.some((card) => card.status !== 'done'))
    .map(([no, entries]) => {
      const cups = entries.flatMap((card) => card.cups.filter((cup) => cup.orderNo === no));
      const waitSec = Math.max(0, Math.floor((nowMs - Math.min(...cups.map((cup) => cup.orderedAt.getTime()))) / 1000));
      return {
        orderId: cups[0].orderId,
        orderNo: no,
        status: 'preparing' as const,
        cups: cups.length,
        readyCups: 0,
        emergency: entries.some((card) => card.emergency),
        cards: entries.map((card) => ({ card, place: places.get(card.key) ?? '未割当' })),
        comments: commentsByOrder.get(cups[0].orderId) ?? [],
        waitSec,
        late: waitSec > 900,
      };
    })
    .sort((a, b) => a.orderNo - b.orderNo);
  return { cards, lanes, looks, nowMs, originals, rows, comments: props.orderComments ?? [] };
}
