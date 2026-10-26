import { z } from 'zod';
import { type GameAction, gameReducer, type Scenario, scoreGame, startGame } from './engine';

export { SCORING_VERSION } from './engine';

const key = z.string().min(1).max(200);
const bayId = z.number().int().min(1).max(6);
const place = z
  .union([z.enum(['front', 'queueFront']), z.object({ beforeKey: key }).strict(), z.object({ afterKey: key }).strict()])
  .optional();
const cupIds = z.array(key).min(1).max(100);
export const replaySchema = z
  .array(
    z.discriminatedUnion('type', [
      z.object({ type: z.literal('tick'), seconds: z.number().int().min(1).max(1800) }).strict(),
      z.object({ type: z.literal('pause') }).strict(),
      z.object({ type: z.literal('finish') }).strict(),
      z.object({ type: z.literal('assign'), key, bayId, place }).strict(),
      z.object({ type: z.literal('move'), key, bayId, place }).strict(),
      z.object({ type: z.literal('return'), key }).strict(),
      z.object({ type: z.literal('complete'), bayId }).strict(),
      z.object({ type: z.literal('start'), bayId }).strict(),
      z.object({ type: z.literal('unstart'), bayId }).strict(),
      z.object({ type: z.literal('split'), key, cupId: key }).strict(),
      z.object({ type: z.literal('discard'), key, cupIds }).strict(),
      z.object({ type: z.literal('rebrew-cups'), cupIds, reason: z.string().max(100) }).strict(),
      z.object({ type: z.literal('cancel-emergency'), key }).strict(),
      z.object({ type: z.literal('merge'), first: key, second: key }).strict(),
    ])
  )
  .min(1)
  .max(4000);

export function appendReplay(trace: GameAction[], action: GameAction) {
  const previous = trace.at(-1);
  if (action.type === 'tick' && previous?.type === 'tick' && previous.seconds + action.seconds <= 1800)
    previous.seconds += action.seconds;
  else trace.push({ ...action });
}
export function replayRun(scenario: Scenario, seed: number, input: unknown) {
  const actions = replaySchema.parse(input) as GameAction[];
  let state = startGame(scenario, seed);
  for (const action of actions) {
    if (state.status === 'finished') throw new Error('終了後の操作が含まれています');
    state = gameReducer(state, action);
  }
  if (state.status !== 'finished') throw new Error('終了していないゲームです');
  return { state, result: scoreGame(state) };
}
