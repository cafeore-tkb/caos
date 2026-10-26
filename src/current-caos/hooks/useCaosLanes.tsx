import { createContext, useContext } from 'react';
import type { Barista } from '../../types';
import type { ShiftFeed } from '../common';
import { upcomingLaneCandidate } from '../common/lib/caosShiftFeed';
export const CurrentLanesContext = createContext({
  bays: [] as Barista[], editable: true, onOpen: (_id: number) => {},
  feed: null as ShiftFeed | null, nowMs: 0,
  onChange: undefined as ((id: number) => void) | undefined,
  onPick: undefined as ((id: number, name: string, senior: boolean) => void) | undefined,
});
export function useCaosLanes() {
  const { bays, onOpen, editable, feed, nowMs, onChange, onPick } = useContext(CurrentLanesContext);
  return {
    editable, lanes: bays.map((bay) => ({ dripper: bay.id, name: bay.name, senior: Boolean(bay.canHandleSpecial) })),
    upcomingOf: (id: number) => upcomingLaneCandidate(feed, id, nowMs, bays.find((bay) => bay.id === id)?.name ?? ''),
    changeToNext: (id: number, next?: { name: string; senior: boolean }) => next && onPick ? onPick(id, next.name, next.senior) : (onChange ?? onOpen)(id),
    openChange: onChange ?? onOpen, openSettings: () => onOpen(1),
    shiftFeed: { feed, status: feed ? 'ok' : 'off', feedKey: feed ? '練習シフト' : '', loading: false, error: null },
    hasSenior: bays.some((bay) => bay.canHandleSpecial),
  };
}
