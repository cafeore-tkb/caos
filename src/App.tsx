import React, { useState, useEffect, useRef } from 'react';
import {
  BeanCode,
  BeanItem,
  Barista,
  UnassignedOrder,
  OrderTicket,
  LearningEngineLog,
} from './types';
import {
  INITIAL_BARISTAS,
  INITIAL_LEARNING_LOGS,
  INITIAL_BEANS,
  BEAN_NAME_MAP,
} from './data/initialData';
import { TopHeader } from './components/TopHeader';
import { Sidebar, NavTab } from './components/Sidebar';
import { DispatchBoard } from './components/DispatchBoard';
import { UnassignedOrdersPanel } from './components/UnassignedOrdersPanel';
import { TicketDetailModal } from './components/TicketDetailModal';
import { AssignSlotModal } from './components/AssignSlotModal';
import { NewOrderModal } from './components/NewOrderModal';
import { BaysOverviewView } from './components/BaysOverviewView';
import { BeanQueueView } from './components/BeanQueueView';
import { AiConfigView } from './components/AiConfigView';
import { AnalyticsView } from './components/AnalyticsView';
import { HumanCenteredControlView } from './components/HumanCenteredControlView';
import { soundManager } from './utils/audio';
import { X } from 'lucide-react';

type ControlViewMode = 'current' | 'new';

const makeCleanBaristas = (): Barista[] => INITIAL_BARISTAS.map((barista) => ({
  ...barista,
  status: 'standby',
  remainingStr: '00:00 待機中',
  activeTicketId: undefined,
  queue: [],
  pastTickets: [],
}));

const orderNumber = (id: string) => Number(id.match(/\d+/)?.[0]) || Number.MAX_SAFE_INTEGER;
const queueOrder = (a: OrderTicket, b: OrderTicket) =>
  orderNumber(a.id) - orderNumber(b.id) ||
  (a.itemIndex || 0) - (b.itemIndex || 0) ||
  (a.ticketUid || '').localeCompare(b.ticketUid || '');

const arrangeQueue = (
  queue: OrderTicket[],
  coefficient: number,
  nowSec: number,
  activateFirst = false
) => {
  const existingActive = !activateFirst ? queue.find((ticket) => ticket.status === 'brewing') : undefined;
  const scheduled = queue
    .filter((ticket) => ticket !== existingActive)
    .map((ticket) => ({ ...ticket, status: 'scheduled' as const }))
    .sort(queueOrder);
  const ordered = existingActive ? [existingActive, ...scheduled] : scheduled;
  if (ordered.length === 0) return ordered;

  const first = activateFirst
    ? {
        ...ordered[0],
        status: 'brewing' as const,
        startTimeSec: nowSec,
        timeRemainingSec: Math.round(ordered[0].totalDurationSec * coefficient),
      }
    : ordered[0];
  const result: OrderTicket[] = [first];
  const firstEnd = first.status === 'brewing'
    ? Math.max(nowSec, (first.startTimeSec ?? nowSec) + first.totalDurationSec)
    : (first.startTimeSec ?? nowSec + 10) + first.totalDurationSec;
  let cursor = firstEnd;

  for (const ticket of ordered.slice(1)) {
    const startTimeSec = cursor + 15;
    result.push({ ...ticket, status: 'scheduled', startTimeSec, timeRemainingSec: undefined });
    cursor = startTimeSec + ticket.totalDurationSec;
  }
  return result;
};
const splitIntoDripUnits = (orders: UnassignedOrder[]) => {
  const totalOrderCups = orders.reduce((sum, order) => sum + order.cupCount, 0);
  const units = orders.flatMap((order) => {
    const parts: UnassignedOrder[] = [];
    let remaining = order.cupCount;
    let part = 1;
    while (remaining > 0) {
      const cups = Math.min(2, remaining);
      parts.push({
        ...order,
        ticketUid: `${order.ticketUid || order.id.replace('#', '')}-part${part}`,
        cupCount: cups,
        badgeTag: `${cups}杯 ${order.badgeTag.replace(/^\d+杯\s*/, '')}`,
      });
      remaining -= cups;
      part += 1;
    }
    return parts;
  });
  return units.map((unit, index) => ({
    ...unit,
    itemIndex: index + 1,
    totalItemsInOrder: units.length,
    totalOrderCups,
  }));
};

const MOCK_MENU: BeanCode[] = ['CHAMP', 'ORE', 'KEN', 'TNZ', 'BRA', 'ICE', 'MILK', 'CHAMP', 'ORE', 'SP'];
const MOCK_ORDER_GROUPS: UnassignedOrder[][] = Array.from({ length: 120 }, (_, index) => {
  const number = index + 1;
  const id = `#${number.toString().padStart(3, '0')}`;
  const beanCode = MOCK_MENU[index % MOCK_MENU.length];
  const cupCount = number % 11 === 0 ? 4 : number % 7 === 0 ? 3 : number % 3 === 0 ? 2 : 1;
  const preferredBaristaId = beanCode === 'SP' ? 2 : number % 17 === 0 ? 6 : undefined;
  return splitIntoDripUnits([{
    id,
    ticketUid: `${number.toString().padStart(3, '0')}-1`,
    beanCode,
    beanName: BEAN_NAME_MAP[beanCode],
    cupCount,
    badgeTag: `${cupCount}杯`,
    predictedTimeStr: cupCount > 2 ? '3分30秒' : '2分20秒',
    recommendedBaristas: preferredBaristaId ? `ドリッパー ${preferredBaristaId}` : '全ドリッパー',
    recommendedBayIds: preferredBaristaId ? [preferredBaristaId] : [1, 2, 3, 4, 5, 6],
    preferredBaristaId,
    cardColor: beanCode === 'ICE' ? 'cyan' : beanCode === 'SP' ? 'emerald' : beanCode === 'KEN' ? 'peach' : 'blue',
  }]);
});

export default function App() {
  // Navigation
  const [activeTab, setActiveTab] = useState<NavTab>('control');
  const [controlViewMode, setControlViewMode] = useState<ControlViewMode>('current');

  // Core Data
  const [baristas, setBaristas] = useState<Barista[]>(makeCleanBaristas);
  const [beans, setBeans] = useState<BeanItem[]>(INITIAL_BEANS);
  const [unassignedOrders, setUnassignedOrders] = useState<UnassignedOrder[]>([]);
  const mockOrderCursor = useRef(0);
  const [learningLogs, setLearningLogs] = useState<LearningEngineLog[]>(INITIAL_LEARNING_LOGS);
  const [completedCount, setCompletedCount] = useState<number>(0);

  // Filters & Toggles
  const [selectedBeanFilter, setSelectedBeanFilter] = useState<BeanCode | null>(null);
  const [selectedQueueBean, setSelectedQueueBean] = useState<BeanCode | null>(null);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);

  // Modals
  const [selectedTicket, setSelectedTicket] = useState<OrderTicket | null>(null);
  const [assignSlotData, setAssignSlotData] = useState<{ bayId: number | null; order: UnassignedOrder | null } | null>(null);
  const [isNewOrderOpen, setIsNewOrderOpen] = useState<boolean>(false);

  // Simulation Clock (starts at 08:04:15 -> 29055 seconds)
  const [simTimeSec, setSimTimeSec] = useState<number>(8 * 3600 + 4 * 60 + 15);
  const [isRunning, setIsRunning] = useState<boolean>(true);
  const [simSpeed, setSimSpeed] = useState<number>(1);

  // Linked multi-item order selection (e.g. #152 has items in Bay 1 and Bay 2)
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [realTime, setRealTime] = useState(() => new Date());
  const realTimeSec = realTime.getHours() * 3600 + realTime.getMinutes() * 60 + realTime.getSeconds();

  const sortedUnassignedOrders = [...unassignedOrders].sort((a, b) =>
    orderNumber(a.id) - orderNumber(b.id) || (a.itemIndex || 0) - (b.itemIndex || 0)
  );

  useEffect(() => {
    const clock = window.setInterval(() => setRealTime(new Date()), 1000);
    return () => window.clearInterval(clock);
  }, []);

  // Mock the register sending one complete order at a time.
  useEffect(() => {
    const incoming = window.setInterval(() => {
      const group = MOCK_ORDER_GROUPS[mockOrderCursor.current];
      if (!group) return;
      setUnassignedOrders((prev) => [...prev, ...group.map((order) => ({ ...order }))]);
      mockOrderCursor.current += 1;
    }, 4000);
    return () => window.clearInterval(incoming);
  }, []);

  const handleToggleOrderSelection = (orderId: string) => {
    if (!orderId) {
      setSelectedOrderId(null);
      setSelectedQueueBean(null);
      return;
    }
    if (selectedOrderId === orderId) {
      setSelectedOrderId(null);
      setSelectedQueueBean(null);
      return;
    }
    setSelectedQueueBean(null);
    setSelectedOrderId(orderId);
  };

  // Format digital clock time HH:mm:ss
  const formatTimeStr = (totalSec: number) => {
    const hours = Math.floor(totalSec / 3600) % 24;
    const minutes = Math.floor((totalSec % 3600) / 60);
    const seconds = totalSec % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  // Simulation timer loop
  useEffect(() => {
    if (!isRunning) return;

    const interval = setInterval(() => {
      setSimTimeSec((prev) => prev + 1);

      // Decrement remaining seconds on active tickets
      setBaristas((prevBaristas) =>
        prevBaristas.map((barista) => {
          if (barista.queue.length === 0) return barista;

          const updatedQueue = [...barista.queue];
          const activeTicket = { ...updatedQueue[0] };

          if (activeTicket.status === 'brewing' && activeTicket.timeRemainingSec !== undefined) {
            const nextSec = Math.max(0, activeTicket.timeRemainingSec - 1);
            activeTicket.timeRemainingSec = nextSec;
            updatedQueue[0] = activeTicket;

            const m = Math.floor(nextSec / 60);
            const s = nextSec % 60;
            const remainingStr = `0${m}:${s < 10 ? '0' : ''}${s} 残り`;

            return {
              ...barista,
              status: nextSec <= 15 ? 'imminent' : 'brewing',
              remainingStr,
              queue: updatedQueue,
            };
          }
          return barista;
        })
      );
    }, 1000 / simSpeed);

    return () => clearInterval(interval);
  }, [isRunning, simSpeed]);

  // Advance / complete a bay's active order
  const handleAdvanceBay = (bayId: number) => {
    soundManager.playComplete();

    const targetBarista = baristas.find((b) => b.id === bayId);
    if (!targetBarista || targetBarista.queue.length === 0) return;

    const completedTicket = targetBarista.queue[0];

    // Compute log outside of state updater to prevent duplicate execution
    const actualM = Math.floor(completedTicket.totalDurationSec / 60);
    const actualS = completedTicket.totalDurationSec % 60;
    const deltaSec = Math.floor(Math.random() * 20 - 10);
    const deltaStr = deltaSec < 0 ? `(${deltaSec}秒)` : `(+${deltaSec}秒)`;

    const newLog: LearningEngineLog = {
      id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      baristaKey: `${String.fromCharCode(64 + targetBarista.id)} ${targetBarista.name}`,
      recentActual: `${actualM}:${actualS < 10 ? '0' : ''}${actualS}`,
      deltaStr,
      deltaType: deltaSec < 0 ? 'faster' : 'slower',
      coefficient: targetBarista.coefficient,
      coefficientStatus:
        deltaSec < -15
          ? `最速補正 ${targetBarista.coefficient.toFixed(2)}`
          : deltaSec < 0
          ? `係数 ${targetBarista.coefficient.toFixed(2)} 維持`
          : `係数 ${targetBarista.coefficient.toFixed(2)} 連動`,
      timestamp: formatTimeStr(realTimeSec),
    };

    setLearningLogs((prevLogs) => [newLog, ...prevLogs.filter((l) => l.id !== newLog.id).slice(0, 4)]);
    setCompletedCount((c) => c + 1);

    setBaristas((prev) =>
      prev.map((b) => {
        if (b.id !== bayId) return b;
        if (b.queue.length === 0) return b;

        const doneTicket: OrderTicket = {
          ...b.queue[0],
          status: 'completed',
          endTimeSec: realTimeSec,
        };
        const pastTickets = [...(b.pastTickets || []), doneTicket];
        // Re-anchor the entire downstream queue to the actual completion time.
        // This compensates every later card when the active drip ran long or short.
        const nextQueue = arrangeQueue(b.queue.slice(1), b.coefficient, realTimeSec, true);

        return {
          ...b,
          status: nextQueue.length > 0 ? 'brewing' : 'standby',
          remainingStr: nextQueue.length > 0 ? '01:50 残り' : '00:00 待機中',
          queue: nextQueue,
          pastTickets,
        };
      })
    );
  };

  // Assign order to a bay
  const handleAssignOrderToBay = (orderUidOrId: string, targetBayId: number) => {
    soundManager.playDispatch();

    const orderToAssign = unassignedOrders.find(
      (o) => o.ticketUid === orderUidOrId || o.id === orderUidOrId
    );
    if (!orderToAssign) return;
    if (orderToAssign.preferredBaristaId && orderToAssign.preferredBaristaId !== targetBayId) return;

    // Remove from unassigned
    setUnassignedOrders((prev) =>
      prev.filter((o) => (o.ticketUid || o.id) !== (orderToAssign.ticketUid || orderToAssign.id))
    );

    // Calculate dynamic start time based on target bay's queue
    const targetBay = baristas.find((b) => b.id === targetBayId);
    const lastTicket = targetBay?.queue[targetBay.queue.length - 1];
    const duration = orderToAssign.cupCount > 1 ? 195 : 135;
    const computedStartSec = lastTicket && lastTicket.startTimeSec && lastTicket.totalDurationSec
      ? lastTicket.startTimeSec + lastTicket.totalDurationSec + 15
      : realTimeSec + 10;

    // Convert to OrderTicket
    const newTicket: OrderTicket = {
      id: orderToAssign.id,
      ticketUid: orderToAssign.ticketUid || `${orderToAssign.id}-bay${targetBayId}`,
      itemIndex: orderToAssign.itemIndex,
      totalItemsInOrder: orderToAssign.totalItemsInOrder,
      totalOrderCups: orderToAssign.totalOrderCups,
      orderNotes: orderToAssign.orderNotes,
      sourceOrderIds: orderToAssign.sourceOrderIds,
      preferredBaristaId: orderToAssign.preferredBaristaId,
      beanCode: orderToAssign.beanCode,
      beanName: orderToAssign.beanName,
      cupCount: orderToAssign.cupCount,
      tag: orderToAssign.badgeTag.includes('HOT') ? 'HOT' : orderToAssign.badgeTag.includes('ICE') ? 'ICE' : orderToAssign.badgeTag.includes('BATCH') ? 'BATCH' : orderToAssign.badgeTag.includes('SP') ? '★SP' : undefined,
      status: 'scheduled',
      scheduledTimeStr: `${Math.floor(duration / 60)}:${(duration % 60).toString().padStart(2, '0')}`,
      startTimeSec: computedStartSec,
      totalDurationSec: duration,
    };

    // Add to target bay queue
    setBaristas((prev) =>
      prev.map((b) => {
        if (b.id !== targetBayId) return b;
        return {
          ...b,
          queue: arrangeQueue([...b.queue, newTicket], b.coefficient, realTimeSec),
        };
      })
    );
  };

  const ticketKey = (ticket: OrderTicket) => ticket.ticketUid || `${ticket.id}-${ticket.itemIndex || 1}`;

  const handleMoveScheduledTicket = (ticket: OrderTicket, targetBayId: number) => {
    if (ticket.status !== 'scheduled') return;
    if (ticket.preferredBaristaId && ticket.preferredBaristaId !== targetBayId) return;
    const key = ticketKey(ticket);
    setBaristas((prev) => {
      return prev.map((bay) => ({
        ...bay,
        queue: arrangeQueue(
          bay.id === targetBayId
            ? [...bay.queue.filter((item) => ticketKey(item) !== key), { ...ticket, status: 'scheduled' as const }]
            : bay.queue.filter((item) => ticketKey(item) !== key),
          bay.coefficient,
          realTimeSec
        ),
      }));
    });
    setSelectedOrderId(null);
    setSelectedQueueBean(null);
    soundManager.playDispatch();
  };

  const handleReturnScheduledTicket = (ticket: OrderTicket) => {
    if (ticket.status !== 'scheduled') return;
    const key = ticketKey(ticket);
    setBaristas((prev) => prev.map((bay) => ({
      ...bay,
      queue: bay.queue.filter((item) => ticketKey(item) !== key),
    })));
    setUnassignedOrders((prev) => [{
      id: ticket.id,
      ticketUid: ticket.ticketUid,
      itemIndex: ticket.itemIndex,
      totalItemsInOrder: ticket.totalItemsInOrder,
      totalOrderCups: ticket.totalOrderCups,
      orderNotes: ticket.orderNotes,
      sourceOrderIds: ticket.sourceOrderIds,
      beanCode: ticket.beanCode,
      beanName: ticket.beanName,
      cupCount: ticket.cupCount,
      badgeTag: `${ticket.cupCount}杯 ${ticket.tag || 'HOT'}`,
      predictedTimeStr: ticket.scheduledTimeStr || '2:15',
      recommendedBaristas: ticket.preferredBaristaId ? `ドリッパー ${ticket.preferredBaristaId}` : '全ドリッパー',
      recommendedBayIds: ticket.preferredBaristaId ? [ticket.preferredBaristaId] : [1, 2, 3, 4, 5, 6],
      preferredBaristaId: ticket.preferredBaristaId,
      cardColor: ticket.beanCode === 'ICE' ? 'cyan' : ticket.beanCode === 'SP' ? 'emerald' : 'blue',
    }, ...prev]);
    setSelectedOrderId(null);
    setSelectedQueueBean(null);
    soundManager.playDispatch();
  };

  // Directly assign an unassigned order to its recommended bay
  const handleDirectAssign = (order: UnassignedOrder) => {
    const recommendedBay = order.preferredBaristaId || order.recommendedBayIds[0] || 1;
    handleAssignOrderToBay(order.id, recommendedBay);
  };

  const handleMergeUnassignedOrders = (firstUid: string, secondUid: string) => {
    setUnassignedOrders((prev) => {
      const first = prev.find((order) => (order.ticketUid || order.id) === firstUid);
      const second = prev.find((order) => (order.ticketUid || order.id) === secondUid);
      if (!first || !second || first.cupCount !== 1 || second.cupCount !== 1 || first.beanCode !== second.beanCode) return prev;
      if (first.preferredBaristaId !== second.preferredBaristaId) return prev;
      const sourceOrderIds = Array.from(new Set([...(first.sourceOrderIds || [first.id]), ...(second.sourceOrderIds || [second.id])])).sort((a, b) => orderNumber(a) - orderNumber(b));
      const merged: UnassignedOrder = {
        ...first,
        id: sourceOrderIds.join('+'),
        ticketUid: `merged-${[firstUid, secondUid].sort().join('-')}`,
        sourceOrderIds,
        cupCount: 2,
        badgeTag: `2杯 統合`,
        orderNotes: `${sourceOrderIds.join(' + ')} 同時ドリップ`,
      };
      return [...prev.filter((order) => {
        const uid = order.ticketUid || order.id;
        return uid !== firstUid && uid !== secondUid;
      }), merged];
    });
    setSelectedOrderId(null);
    setSelectedQueueBean(null);
  };

  // Manual trigger for AI recalibration
  const handleTriggerRecalibration = () => {
    soundManager.playDispatch();
    setBaristas((prev) =>
      prev.map((b) => {
        const drift = (Math.random() * 0.04 - 0.02);
        const newCoef = Math.max(0.85, Math.min(1.20, Number((b.coefficient + drift).toFixed(2))));
        return {
          ...b,
          coefficient: newCoef,
        };
      })
    );
  };

  // Reset to initial screenshot state
  const handleResetData = () => {
    setBaristas(makeCleanBaristas());
    setUnassignedOrders([]);
    mockOrderCursor.current = 0;
    setLearningLogs(INITIAL_LEARNING_LOGS);
    setSimTimeSec(8 * 3600 + 4 * 60 + 15);
    setCompletedCount(0);
    setSelectedOrderId(null);
    setSelectedQueueBean(null);
    soundManager.playDispatch();
  };

  // Add new custom mock order
  const handleAddNewOrder = (newOrd: {
    beanCode: BeanCode;
    beanName: string;
    cupCount: number;
    tag: string;
    predictedTimeStr: string;
    recommendedBaristas: string;
    recommendedBayIds: number[];
    preferredBaristaId?: number;
  }) => {
    const nextIdNum = 172 + Math.floor(Math.random() * 50);
    const created: UnassignedOrder = {
      id: `#${nextIdNum}`,
      beanCode: newOrd.beanCode,
      beanName: newOrd.beanName,
      cupCount: newOrd.cupCount,
      badgeTag: `${newOrd.cupCount}杯 ${newOrd.tag}`,
      predictedTimeStr: newOrd.predictedTimeStr,
      recommendedBaristas: newOrd.recommendedBaristas,
      recommendedBayIds: newOrd.recommendedBayIds,
      preferredBaristaId: newOrd.preferredBaristaId,
      cardColor: newOrd.beanCode === 'ICE' ? 'cyan' : newOrd.beanCode === 'KEN' ? 'peach' : newOrd.beanCode === 'SP' ? 'emerald' : 'blue',
    };
    setUnassignedOrders((prev) => [...prev, ...splitIntoDripUnits([created])]);
    soundManager.playDispatch();
  };

  // Live cup totals shown in the header
  const unassignedCardCups = unassignedOrders.reduce((acc, cur) => acc + cur.cupCount, 0);
  const totalUnassignedDisplay = unassignedCardCups;

  const currentBayQueueCups = baristas.reduce(
    (acc, b) => acc + b.queue.reduce((qAcc, t) => qAcc + t.cupCount, 0),
    0
  );
  const totalWaitingCupsDisplay = currentBayQueueCups;

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#f0f4fa] text-[#0f172a] select-none font-sans">
      {/* 1. Left Navigation Rail */}
      <Sidebar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        controlViewMode={controlViewMode}
        onSelectControlViewMode={setControlViewMode}
        activeBayCount={baristas.filter((b) => b.queue.length > 0).length}
        totalBays={6}
      />

      {/* 2. Main Workstation Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
        {/* Top Header */}
        <TopHeader
          timeStr={`${realTime.getHours().toString().padStart(2, '0')}:${realTime.getMinutes().toString().padStart(2, '0')}:${realTime.getSeconds().toString().padStart(2, '0')}`}
          unassignedCups={totalUnassignedDisplay}
          totalWaitingCups={totalWaitingCupsDisplay}
          selectedBeanFilter={selectedBeanFilter}
          onSelectBeanFilter={setSelectedBeanFilter}
          soundEnabled={soundEnabled}
          onToggleSound={() => setSoundEnabled(!soundEnabled)}
          isRunning={isRunning}
          onTogglePlay={() => setIsRunning(!isRunning)}
          simSpeed={simSpeed}
          onChangeSpeed={setSimSpeed}
          onResetData={handleResetData}
          onOpenNewOrder={() => setIsNewOrderOpen(true)}
        />

        {/* Dynamic Tab Body */}
        <main className="flex-1 p-2 flex flex-col gap-2 overflow-hidden">
              {controlViewMode === 'current' ? (
                <div className="h-full min-h-0 flex flex-col gap-2">
                  {/* Master 6-Bay Dispatch Board (Top 2/3) */}
                  <DispatchBoard
                    baristas={baristas}
                    highlightFilter={selectedBeanFilter}
                    selectedOrderId={selectedQueueBean ? null : selectedOrderId}
                    onSelectOrder={handleToggleOrderSelection}
                    onAdvanceBay={handleAdvanceBay}
                    onOpenTicketDetail={(ticket) => setSelectedTicket(ticket)}
                    actionTicketKey={selectedTicket ? ticketKey(selectedTicket) : null}
                    onMoveTicket={handleMoveScheduledTicket}
                    onReturnToUnassigned={handleReturnScheduledTicket}
                    onCloseTicketAction={() => setSelectedTicket(null)}
                    onOpenEmptySlot={(bayId) => setAssignSlotData({ bayId, order: null })}
                    simTimeSec={realTimeSec}
                  />

                  {/* Bottom Section: touch-friendly unassigned queue */}
                  <div className="h-[132px] min-h-0 overflow-visible relative z-[70]">
                    <UnassignedOrdersPanel
                      orders={sortedUnassignedOrders}
                      selectedOrderId={selectedOrderId}
                      onSelectOrder={handleToggleOrderSelection}
                      onSelectQueueOrder={(order) => {
                        setSelectedOrderId(order.id);
                        setSelectedQueueBean(order.beanCode);
                      }}
                      onClearSelection={() => {
                        setSelectedOrderId(null);
                        setSelectedQueueBean(null);
                      }}
                      onAssignToBay={(order, bayId) => handleAssignOrderToBay(order.ticketUid || order.id, bayId)}
                      onMergeOrders={handleMergeUnassignedOrders}
                    />
                  </div>
                </div>
              ) : (
                <HumanCenteredControlView
                  baristas={baristas}
                  unassignedOrders={sortedUnassignedOrders}
                  simTimeSec={realTimeSec}
                  selectedOrderId={selectedOrderId}
                  highlightFilter={selectedBeanFilter}
                  onSelectOrder={handleToggleOrderSelection}
                  onSelectQueueOrder={(order) => {
                    setSelectedOrderId(order.id);
                    setSelectedQueueBean(order.beanCode);
                  }}
                  onAdvanceBay={handleAdvanceBay}
                  onOpenTicketDetail={(ticket) => setSelectedTicket(ticket)}
                  onOpenEmptySlot={(bayId) => setAssignSlotData({ bayId, order: null })}
                  onAssignOrder={(order) => setAssignSlotData({ bayId: null, order })}
                />
              )}
        </main>

        {activeTab !== 'control' && (
          <aside className="context-sheet absolute top-[56px] right-0 bottom-0 z-40 w-[min(440px,44vw)] min-w-[360px] bg-white border-l border-slate-300 shadow-2xl flex flex-col">
            <div className="h-[52px] px-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between shrink-0">
              <h2 className="text-[16px] font-black text-slate-950">
                {activeTab === 'bays' ? 'ドリッパー' : activeTab === 'beans' ? '豆キュー' : activeTab === 'ai' ? '補正設定' : '実績'}
              </h2>
              <button type="button" onClick={() => setActiveTab('control')} className="w-11 h-11 rounded-full hover:bg-slate-200 flex items-center justify-center" aria-label="補助パネルを閉じる">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto p-3">
              {activeTab === 'bays' && <BaysOverviewView baristas={baristas} onSelectBayForDispatch={() => setActiveTab('control')} />}
              {activeTab === 'beans' && (
                <BeanQueueView
                  beans={beans}
                  onUpdateBean={(updated) => setBeans((prev) => prev.map((b) => (b.code === updated.code ? updated : b)))}
                  onAddBean={(newBean) => setBeans((prev) => [newBean, ...prev])}
                  onDeleteBean={(code) => setBeans((prev) => prev.filter((b) => b.code !== code))}
                />
              )}
              {activeTab === 'ai' && (
                <AiConfigView
                  baristas={baristas}
                  logs={learningLogs}
                  onUpdateCoefficient={(bayId, newCoef) => setBaristas((prev) => prev.map((b) => (b.id === bayId ? { ...b, coefficient: newCoef } : b)))}
                  onResetLearning={handleResetData}
                />
              )}
              {activeTab === 'analytics' && <AnalyticsView baristas={baristas} completedCount={completedCount} cph={94 + completedCount * 2} />}
            </div>
          </aside>
        )}
      </div>

      {/* Ticket Detail Recipe Modal */}
      {selectedTicket && controlViewMode === 'new' && (
        <TicketDetailModal
          ticket={selectedTicket}
          currentBayId={baristas.find((bay) => bay.queue.some((ticket) => ticketKey(ticket) === ticketKey(selectedTicket)))?.id || null}
          onClose={() => {
            setSelectedTicket(null);
            setSelectedOrderId(null);
            setSelectedQueueBean(null);
          }}
          onMoveTicket={handleMoveScheduledTicket}
          onReturnToUnassigned={handleReturnScheduledTicket}
        />
      )}

      {/* Assign Slot Modal */}
      {assignSlotData && (
        <AssignSlotModal
          bayId={assignSlotData.bayId}
          targetOrder={assignSlotData.order}
          baristas={baristas}
          unassignedOrders={sortedUnassignedOrders}
          onClose={() => setAssignSlotData(null)}
          onAssign={handleAssignOrderToBay}
        />
      )}

      {/* New Order Modal */}
      {isNewOrderOpen && (
        <NewOrderModal
          onClose={() => setIsNewOrderOpen(false)}
          onAddOrder={handleAddNewOrder}
        />
      )}
    </div>
  );
}
