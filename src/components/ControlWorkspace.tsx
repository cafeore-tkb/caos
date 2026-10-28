import type React from 'react';
import { LegacyBoard } from '../current-caos/bridge/LegacyBoard';
import type { CaosPlace, ShiftFeed } from '../current-caos/common';
import type { BoardComment } from '../current-caos/logic/comments';
import type { Barista, OrderTicket, UnassignedOrder } from '../types';

import type { ControlViewMode } from '../utils/controlViews';

export { CONTROL_VIEWS, type ControlViewMode } from '../utils/controlViews';
export interface ControlViewProps {
  baristas: Barista[];
  shift?: {
    feed: ShiftFeed;
    onPick: (id: number, name: string, senior: boolean) => void;
    onSwap: (first: number, second: number) => void;
  };
  unassignedOrders: UnassignedOrder[];
  nextAvailable: Array<{ bayNumber: number; seconds: number; isStandby: boolean }>;
  selectedOrderId: string | null;
  actionTicketKey: string | null;
  panelTicketKey?: string | null;
  onClosePanel?: () => void;
  onAddEmergency?: (cupIds: string[], reason: string) => Promise<string[] | null>;
  onCancelEmergency?: (key: string) => void;
  currentTimeSec: number;
  clockOriginMs?: number;
  onFollowNowChange?: (following: boolean) => void;
  orderComments?: readonly BoardComment[];
  onInteraction?: (kind: string) => void;
  onDiscard?: (key: string, cupIds: string[]) => boolean;
  onUnstartBay?: (bayId: number) => void;
  onSplitCup?: (key: string, cupId: string) => void;
  onOpenLane?: (bayId: number) => void;
  searchOpen?: boolean;
  onOpenSearch?: () => void;
  onCloseSearch?: () => void;
  emptyBay?: number | null;
  onCloseEmptySlot?: () => void;
  timelineCommand: { direction: 'back' | 'now' | 'forward'; id: number } | null;
  onSelectOrder: (orderId: string) => void;
  onAdvanceBay: (bayId: number) => void;
  onOpenTicketDetail: (ticket: OrderTicket) => void;
  onMoveTicket: (ticket: OrderTicket, targetBayId: number, place?: CaosPlace) => void;
  onReturnToUnassigned: (ticket: OrderTicket) => void;
  onCloseTicketAction: () => void;
  onRequestRebrew: (ticket: OrderTicket, bayId: number) => void;
  onOpenEmptySlot: (bayId: number) => void;
  onAssignToBay: (order: UnassignedOrder, bayId: number, place?: CaosPlace) => void;
  onMergeOrders: (firstUid: string, secondUid: string) => void;
}
export const ControlWorkspace: React.FC<ControlViewProps & { mode: ControlViewMode }> = (props) => (
  <LegacyBoard {...props} />
);
