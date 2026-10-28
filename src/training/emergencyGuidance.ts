import { dripperLabel } from '../current-caos/common';
import type { GameState } from './engine';
import type { TourHint } from './tourHints';

export function emergencyGuidance(state: GameState): (TourHint & { title: string }) | null {
  const trial = state.emergencies.find((entry) => entry.status === 'pending');
  if (!trial) return null;
  const bay = state.bays.find((entry) => entry.queue.some((card) => card.trainingCupIds?.includes(trial.cupId ?? '')));
  const source = bay?.queue.find((card) => card.trainingCupIds?.includes(trial.cupId ?? ''));
  const selector = `[data-search-key="${(source?.ticketUid ?? trial.sourceKey ?? '').replace(/["\\]/g, '\\$&')}"]`;
  return {
    title: `${dripperLabel(bay?.id ?? trial.bayId ?? 1)}で${trial.reason ?? '抽出ミス'}！ ${source?.id ?? ''}`,
    message: '該当カードを押し、「緊急（淹れ直し）」へ。対象のカップと理由を選び、手配してください。',
    queries: [
      { selector: '.caos-side-panel form button[aria-pressed="false"]', text: trial.reason ?? '抽出ミス' },
      { selector: '.caos-side-panel form button[type="submit"]' },
      { selector: `${selector} button[aria-label="緊急（淹れ直し）"]` },
      { selector },
      { selector: '[data-emergency-notice]' },
    ],
  };
}
