import type { Barista } from '../types';

/** Draw once per game. Server replay derives the same hidden factors from the seed. */
export function simulatedRoster(bays: Barista[], seed: number): Barista[] {
  let state = (seed ^ 0x51af7c03) >>> 0;
  const random = () => {
    state += 0x6d2b79f5;
    let n = state;
    n = Math.imul(n ^ (n >>> 15), n | 1);
    n ^= n + Math.imul(n ^ (n >>> 7), n | 61);
    return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
  };
  const hot = [2, 3, 4].filter(() => random() < 0.25);
  if (hot.length > 2) hot.splice(Math.floor(random() * hot.length), 1);
  const candidates = bays.filter((bay) => !bay.canHandleSpecial && !hot.includes(bay.id));
  const extraSenior = random() < 0.25 ? candidates[Math.floor(random() * candidates.length)]?.id : undefined;
  return bays.map((bay) => {
    const senior = Boolean(bay.canHandleSpecial || bay.id === extraSenior);
    const factor = () => (senior ? 90 + Math.floor(random() * 8) : 97 + Math.floor(random() * 11)) / 100;
    return {
      ...bay,
      canHandleSpecial: senior,
      hotOnly: hot.includes(bay.id),
      trainingBrewFactors: { one: factor(), two: factor() },
    };
  });
}
