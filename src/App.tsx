import React, { useState, useEffect } from 'react';
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
  INITIAL_UNASSIGNED_ORDERS,
  INITIAL_LEARNING_LOGS,
  INITIAL_BEANS,
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

type ControlViewMode = 'current' | 'new';

export default function App() {
  // Navigation
  const [activeTab, setActiveTab] = useState<NavTab>('control');
  const [controlViewMode, setControlViewMode] = useState<ControlViewMode>('current');

  // Core Data
  const [baristas, setBaristas] = useState<Barista[]>(INITIAL_BARISTAS);
  const [beans, setBeans] = useState<BeanItem[]>(INITIAL_BEANS);
  const [unassignedOrders, setUnassignedOrders] = useState<UnassignedOrder[]>(INITIAL_UNASSIGNED_ORDERS);
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
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>('#152');

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
      timestamp: formatTimeStr(simTimeSec),
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
          endTimeSec: simTimeSec,
        };
        const pastTickets = [...(b.pastTickets || []), doneTicket];
        const nextQueue = b.queue.slice(1);

        // If next ticket exists, make it active
        if (nextQueue.length > 0) {
          nextQueue[0] = {
            ...nextQueue[0],
            status: 'brewing',
            timeRemainingSec: Math.round(nextQueue[0].totalDurationSec * b.coefficient),
            startTimeSec: simTimeSec,
          };
        }

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
      : simTimeSec + 10;

    // Convert to OrderTicket
    const newTicket: OrderTicket = {
      id: orderToAssign.id,
      ticketUid: orderToAssign.ticketUid || `${orderToAssign.id}-bay${targetBayId}`,
      itemIndex: orderToAssign.itemIndex,
      totalItemsInOrder: orderToAssign.totalItemsInOrder,
      totalOrderCups: orderToAssign.totalOrderCups,
      orderNotes: orderToAssign.orderNotes,
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
          queue: orderToAssign.preferredBaristaId && b.queue.length > 0
            ? [b.queue[0], newTicket, ...b.queue.slice(1)]
            : [...b.queue, newTicket],
        };
      })
    );
  };

  // Directly assign an unassigned order to its recommended bay
  const handleDirectAssign = (order: UnassignedOrder) => {
    const recommendedBay = order.preferredBaristaId || order.recommendedBayIds[0] || 1;
    handleAssignOrderToBay(order.id, recommendedBay);
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
    setBaristas(INITIAL_BARISTAS);
    setUnassignedOrders(INITIAL_UNASSIGNED_ORDERS);
    setLearningLogs(INITIAL_LEARNING_LOGS);
    setSimTimeSec(8 * 3600 + 4 * 60 + 15);
    setCompletedCount(0);
    setSelectedOrderId('#152');
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
    setUnassignedOrders((prev) => [created, ...prev]);
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
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Header */}
        <TopHeader
          timeStr={formatTimeStr(simTimeSec)}
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
        <main className={`flex-1 p-2 flex flex-col gap-2 ${activeTab === 'control' ? 'overflow-hidden' : 'overflow-y-auto'}`}>
          {activeTab === 'control' && (
            <>
              {controlViewMode === 'current' ? (
                <div className="h-full min-h-0 flex flex-col gap-2">
                  {/* Master 6-Bay Dispatch Board (Top 2/3) */}
                  <DispatchBoard
                    baristas={baristas}
                    highlightFilter={selectedBeanFilter}
                    selectedOrderId={selectedOrderId}
                    onSelectOrder={handleToggleOrderSelection}
                    onAdvanceBay={handleAdvanceBay}
                    onOpenTicketDetail={(ticket) => setSelectedTicket(ticket)}
                    onOpenEmptySlot={(bayId) => setAssignSlotData({ bayId, order: null })}
                    simTimeSec={simTimeSec}
                  />

                  {/* Bottom Section: touch-friendly unassigned queue */}
                  <div className="h-[132px] min-h-0 overflow-hidden">
                    <UnassignedOrdersPanel
                      orders={unassignedOrders}
                      selectedOrderId={selectedOrderId}
                      selectedBeanCode={selectedQueueBean}
                      onSelectOrder={handleToggleOrderSelection}
                      onSelectQueueOrder={(order) => {
                        setSelectedOrderId(order.id);
                        setSelectedQueueBean(order.beanCode);
                      }}
                      onAssignToBay={(order, bayId) => handleAssignOrderToBay(order.ticketUid || order.id, bayId)}
                    />
                  </div>
                </div>
              ) : (
                <HumanCenteredControlView
                  baristas={baristas}
                  unassignedOrders={unassignedOrders}
                  simTimeSec={simTimeSec}
                  selectedOrderId={selectedOrderId}
                  selectedQueueBean={selectedQueueBean}
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
            </>
          )}

          {activeTab === 'bays' && (
            <BaysOverviewView
              baristas={baristas}
              onSelectBayForDispatch={() => setActiveTab('control')}
            />
          )}

          {activeTab === 'beans' && (
            <BeanQueueView
              beans={beans}
              onUpdateBean={(updated) => {
                setBeans((prev) =>
                  prev.map((b) => (b.code === updated.code ? updated : b))
                );
              }}
              onAddBean={(newBean) => {
                setBeans((prev) => [newBean, ...prev]);
              }}
              onDeleteBean={(code) => {
                setBeans((prev) => prev.filter((b) => b.code !== code));
              }}
            />
          )}

          {activeTab === 'ai' && (
            <AiConfigView
              baristas={baristas}
              logs={learningLogs}
              onUpdateCoefficient={(bayId, newCoef) => {
                setBaristas((prev) =>
                  prev.map((b) => (b.id === bayId ? { ...b, coefficient: newCoef } : b))
                );
              }}
              onResetLearning={handleResetData}
            />
          )}

          {activeTab === 'analytics' && (
            <AnalyticsView
              baristas={baristas}
              completedCount={completedCount}
              cph={94 + completedCount * 2}
            />
          )}
        </main>
      </div>

      {/* Ticket Detail Recipe Modal */}
      {selectedTicket && (
        <TicketDetailModal
          ticket={selectedTicket}
          onClose={() => setSelectedTicket(null)}
          onCompleteTicket={(ticketId) => {
            const bayWithTicket = baristas.find((b) => b.queue.some((t) => t.id === ticketId));
            if (bayWithTicket) {
              handleAdvanceBay(bayWithTicket.id);
            }
          }}
        />
      )}

      {/* Assign Slot Modal */}
      {assignSlotData && (
        <AssignSlotModal
          bayId={assignSlotData.bayId}
          targetOrder={assignSlotData.order}
          baristas={baristas}
          unassignedOrders={unassignedOrders}
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
