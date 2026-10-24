import { createContext, useContext } from 'react';
import type { Barista } from '../../types';
export const CurrentLanesContext = createContext({ bays: [] as Barista[], editable: true, onOpen: (_id: number) => {} });
export function useCaosLanes() {
  const { bays, onOpen, editable } = useContext(CurrentLanesContext);
  return { editable, lanes: bays.map((bay) => ({ dripper: bay.id, name: bay.name, senior: Boolean(bay.canHandleSpecial) })), upcomingOf: (_id: number): { name: string; senior: boolean } | null => null, changeToNext: (id: number, _next?: unknown) => onOpen(id), openChange: onOpen, openSettings: () => onOpen(1), shiftFeed: { feed: null, status: 'off', feedKey: '', error: null }, hasSenior: bays.some((bay) => bay.canHandleSpecial) };
}
