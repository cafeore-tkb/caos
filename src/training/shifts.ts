import type { ShiftFeed } from '../current-caos/common';
import { upcomingLaneCandidate } from '../current-caos/common/lib/caosShiftFeed';

export const SHIFT_ORIGIN_MS = Date.UTC(2026, 9, 19, 1, 49);
export const SHIFT_NEXT = ['佐藤', '鈴木', '高橋', '渡辺', '伊藤', '山本'];
export const SHIFT_FEED: ShiftFeed = {
  slotMinutes: 60,
  drippers: {
    '2026-10-19 10:00': ['担当A', '担当B', '担当C', '担当D', '担当E', '担当F'],
    '2026-10-19 11:00': SHIFT_NEXT,
  },
  drills: [],
  seniors: ['担当A', '担当F', '佐藤', '山本', '田中'],
  members: [
    ...['担当A', '担当B', '担当C', '担当D', '担当E', '担当F', '佐藤', '鈴木', '高橋', '渡辺', '伊藤', '山本'].map(
      (name) => ({ name, grade: ['担当A', '担当F', '佐藤', '山本'].includes(name) ? 'B4' : 'B2' })
    ),
    { name: '田中', grade: 'B4' },
  ],
  updatedAt: null,
};
export function shiftReminder(nowMs: number) {
  const minute = new Date(nowMs).getUTCMinutes();
  return minute >= 55 ? 'シフト交換5分前' : minute >= 50 ? 'シフト交換10分前' : null;
}
export const nextShift = (bay: number, nowSec: number, name: string) =>
  upcomingLaneCandidate(SHIFT_FEED, bay, SHIFT_ORIGIN_MS + nowSec * 1000, name);
export const shiftClock = (nowSec: number) =>
  new Date(SHIFT_ORIGIN_MS + nowSec * 1000).toLocaleTimeString('ja-JP', {
    timeZone: 'Asia/Tokyo',
    hour: '2-digit',
    minute: '2-digit',
  });
