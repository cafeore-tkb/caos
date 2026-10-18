import type React from 'react';
import type { Barista, OrderTicket, UnassignedOrder } from '../types';
import { ControlViewA } from './ControlViewA';
import { ControlViewC } from './ControlViewC';

export const CONTROL_VIEWS = { current: 'A', c: 'C' } as const;
export type ControlViewMode = keyof typeof CONTROL_VIEWS;
export interface ControlViewProps {
  baristas: Barista[];
  unassignedOrders: UnassignedOrder[];
  nextAvailable: Array<{ bayNumber: number; seconds: number; isStandby: boolean }>;
  selectedOrderId: string | null;
  actionTicketKey: string | null;
  currentTimeSec: number;
  timelineCommand: { direction: 'back' | 'now' | 'forward'; id: number } | null;
  onSelectOrder: (orderId: string) => void;
  onAdvanceBay: (bayId: number) => void;
  onOpenTicketDetail: (ticket: OrderTicket) => void;
  onMoveTicket: (ticket: OrderTicket, targetBayId: number) => void;
  onReturnToUnassigned: (ticket: OrderTicket) => void;
  onCloseTicketAction: () => void;
  onRequestRebrew: (ticket: OrderTicket, bayId: number) => void;
  onOpenEmptySlot: (bayId: number) => void;
  onAssignToBay: (order: UnassignedOrder, bayId: number) => void;
  onMergeOrders: (firstUid: string, secondUid: string) => void;
}
export const ControlWorkspace: React.FC<ControlViewProps & { mode: ControlViewMode }> = ({ mode, ...props }) =>
  mode === 'c' ? <ControlViewC {...props} /> : <ControlViewA {...props} />;
