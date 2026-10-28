import { type GameMode, type GameState, MODES, scoreGame } from './engine';
import { isScoreReview, type ScoreReview } from './feedback';
import { type GradeAssessment, isGradeAssessment } from './grades';

export const HISTORY_KEY = 'caos-training-results-v2';
export const LEGACY_KEY = 'caos-training-results-v1';
export const COURSE_KEY = 'caos-training-course-v1';
export interface ResultEntry {
  id: string;
  mode: GameMode;
  score: number;
  at: string;
  detail?: {
    assessment?: GradeAssessment;
    result: Omit<ReturnType<typeof scoreGame>, 'review'> & { review?: ScoreReview };
    title: string;
    elapsedSec: number;
    randomSeed: number;
    violations: number;
    emergencies: GameState['emergencies'];
    events: GameState['events'];
    cups: GameState['cups'];
  };
}
type Store = Pick<Storage, 'getItem' | 'setItem'>;
const validMode = (mode: unknown): mode is GameMode => typeof mode === 'string' && Object.hasOwn(MODES, mode);
const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
// getRandomValues also works in HTTP LAN previews; randomUUID requires HTTPS.
const resultId = () =>
  [...crypto.getRandomValues(new Uint32Array(4))].map((part) => part.toString(16).padStart(8, '0')).join('-');
export function parseHistory(raw: string | null): ResultEntry[] {
  try {
    const data = JSON.parse(raw ?? '[]');
    if (!Array.isArray(data)) return [];
    return data
      .filter(
        (entry) =>
          entry &&
          typeof entry.id === 'string' &&
          validMode(entry.mode) &&
          finite(entry.score) &&
          entry.score >= 0 &&
          entry.score <= 100 &&
          typeof entry.at === 'string' &&
          Number.isFinite(Date.parse(entry.at))
      )
      .map((entry): ResultEntry => {
        const d = entry.detail;
        const r = d?.result;
        const hasDetail =
          d &&
          typeof d.title === 'string' &&
          finite(d.elapsedSec) &&
          finite(d.randomSeed) &&
          finite(d.violations) &&
          r &&
          r.score === entry.score &&
          finite(r.done) &&
          finite(r.total) &&
          finite(r.quality) &&
          finite(r.penalties) &&
          typeof r.label === 'string' &&
          typeof r.ready === 'boolean' &&
          typeof r.passed === 'boolean' &&
          Array.isArray(r.categories) &&
          r.categories.every(
            (c: { label: unknown; points: unknown; max: unknown; detail: unknown }) =>
              c &&
              typeof c.label === 'string' &&
              finite(c.points) &&
              finite(c.max) &&
              c.max > 0 &&
              typeof c.detail === 'string'
          ) &&
          Array.isArray(r.feedback) &&
          r.feedback.every((f: unknown) => typeof f === 'string') &&
          Array.isArray(d.events) &&
          d.events.every(
            (e: { id: unknown; atSec: unknown; message: unknown }) =>
              e && finite(e.id) && finite(e.atSec) && typeof e.message === 'string'
          ) &&
          Array.isArray(d.emergencies) &&
          d.emergencies.every((e: { status: unknown }) => e && typeof e.status === 'string');
        const detail = hasDetail ? { ...d } : null;
        if (detail && !isScoreReview(detail.result.review)) {
          detail.result = { ...detail.result };
          delete detail.result.review;
        }
        if (detail && !isGradeAssessment(detail.assessment)) delete detail.assessment;
        return {
          id: entry.id,
          mode: entry.mode,
          score: entry.score,
          at: entry.at,
          ...(detail ? { detail } : {}),
        };
      })
      .slice(-100);
  } catch {
    return [];
  }
}
export function readHistory(store?: Store): ResultEntry[] {
  try {
    const storage = store ?? localStorage;
    const current = parseHistory(storage.getItem(HISTORY_KEY));
    let migrated: ResultEntry[] = [];
    try {
      const legacy: unknown = JSON.parse(storage.getItem(LEGACY_KEY) ?? '[]');
      migrated = parseHistory(
        JSON.stringify(Array.isArray(legacy) ? legacy.map((e, i) => ({ ...e, id: `legacy-${i}-${e?.at}` })) : [])
      );
    } catch {
      /* A damaged legacy entry must not hide current results. */
    }
    return [...migrated.filter((old) => !current.some((entry) => entry.id === old.id)), ...current].slice(-100);
  } catch {
    return [];
  }
}
export function createResult(state: GameState, at = new Date().toISOString(), id: string = resultId()): ResultEntry {
  const result = scoreGame(state);
  return {
    id,
    at,
    mode: state.scenario.mode,
    score: result.score,
    detail: {
      result,
      title: state.scenario.title,
      elapsedSec: state.nowSec,
      randomSeed: state.randomSeed,
      violations: state.violations,
      emergencies: state.emergencies,
      events: state.events,
      cups: state.cups,
    },
  };
}
export function saveResult(entry: ResultEntry, store?: Store) {
  const entries = [...readHistory(store).filter((old) => old.id !== entry.id), entry].slice(-100);
  try {
    (store ?? localStorage).setItem(HISTORY_KEY, JSON.stringify(entries));
    return { entries, saved: true };
  } catch {
    return { entries, saved: false };
  }
}
export function readCourse(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(COURSE_KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((s) => typeof s === 'string') : [];
  } catch {
    return [];
  }
}
