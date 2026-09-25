import type React from 'react';
import type { Barista, OrderTicket, UnassignedOrder } from '../types';
import { ControlViewA } from './ControlViewA';
import { ControlViewB } from './ControlViewB';
import { ControlViewC } from './ControlViewC';

export type ControlViewMode = 'current' | 'new' | 'c';

interface ControlWorkspaceProps {
  mode: ControlViewMode;
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

export const ControlWorkspace: React.FC<ControlWorkspaceProps> = ({
  mode,
  baristas,
  unassignedOrders,
  nextAvailable,
  selectedOrderId,
  actionTicketKey,
  currentTimeSec,
  timelineCommand,
  onSelectOrder,
  onAdvanceBay,
  onOpenTicketDetail,
  onMoveTicket,
  onReturnToUnassigned,
  onCloseTicketAction,
  onRequestRebrew,
  onOpenEmptySlot,
  onAssignToBay,
  onMergeOrders,
}) => {
  const originalBaristas = baristas.map((barista) =>
    barista.id === 1 && barista.name === 'なかにしゆうな' ? { ...barista, name: '鈴木' } : barista
  );

  if (mode === 'new') {
    return (
      <ControlViewB
        baristas={originalBaristas}
        unassignedOrders={unassignedOrders}
        simTimeSec={currentTimeSec}
        selectedOrderId={selectedOrderId}
        highlightFilter={null}
        onSelectOrder={onSelectOrder}
        onSelectQueueOrder={(order) => onSelectOrder(order.id)}
        onAdvanceBay={onAdvanceBay}
        onOpenTicketDetail={onOpenTicketDetail}
        onOpenEmptySlot={onOpenEmptySlot}
        onAssignToBay={onAssignToBay}
        onRequestRebrew={onRequestRebrew}
      />
    );
  }

  if (mode === 'c') {
    return (
      <ControlViewC
        baristas={baristas}
        unassignedOrders={unassignedOrders}
        simTimeSec={currentTimeSec}
        selectedOrderId={selectedOrderId}
        highlightFilter={null}
        onSelectOrder={onSelectOrder}
        onSelectQueueOrder={(order) => onSelectOrder(order.id)}
        onAdvanceBay={onAdvanceBay}
        onOpenTicketDetail={onOpenTicketDetail}
        onOpenEmptySlot={onOpenEmptySlot}
        onAssignToBay={onAssignToBay}
        onRequestRebrew={onRequestRebrew}
      />
    );
  }

  return (
    <ControlViewA
      baristas={originalBaristas}
      unassignedOrders={unassignedOrders}
      nextAvailable={nextAvailable}
      selectedOrderId={selectedOrderId}
      actionTicketKey={actionTicketKey}
      currentTimeSec={currentTimeSec}
      timelineCommand={timelineCommand}
      onSelectOrder={onSelectOrder}
      onAdvanceBay={onAdvanceBay}
      onOpenTicketDetail={onOpenTicketDetail}
      onMoveTicket={onMoveTicket}
      onReturnToUnassigned={onReturnToUnassigned}
      onCloseTicketAction={onCloseTicketAction}
      onRequestRebrew={onRequestRebrew}
      onOpenEmptySlot={onOpenEmptySlot}
      onAssignToBay={onAssignToBay}
      onMergeOrders={onMergeOrders}
    />
  );
};
