import type { GameMode, GameState } from './engine';

export interface RunConditions {
  source: 'saved' | 'draw';
  roster: { id: number; senior: boolean; hotOnly: boolean }[];
  emergencies: {
    id: number;
    drawn: boolean;
    status: string;
    orderId?: number;
    bayId?: number;
    reason?: string;
    atSec?: number;
  }[];
  randomizedOrders: boolean;
}
export interface RunSummary {
  displayName: string;
  mode: GameMode;
  rulesVersion: string;
  completedAt: number;
  score: number;
  businessScore: number;
  done: number;
  total: number;
  quality: number;
  forecast: boolean;
  categories: { label: string; points: number; max: number; detail: string }[];
  penalties: number | null;
  feedback: string[];
  conditions: RunConditions | null;
}

/** Public facts only: never expose seeds, hidden timing factors or private device IDs. */
export function summarizeConditions(state: GameState, source: RunConditions['source']): RunConditions {
  return {
    source,
    roster: state.bays.map((bay) => ({
      id: bay.id,
      senior: Boolean(bay.canHandleSpecial),
      hotOnly: Boolean(bay.hotOnly),
    })),
    emergencies: state.emergencies.map((trial) => ({
      id: trial.id,
      drawn: trial.willOccur,
      status: trial.status,
      ...(trial.cupId ? { orderId: state.cups[trial.cupId]?.orderId } : {}),
      bayId: trial.bayId,
      reason: trial.willOccur ? trial.reason : undefined,
      atSec: trial.triggeredAtSec,
    })),
    randomizedOrders: state.scenario.kind === 'synthetic',
  };
}
