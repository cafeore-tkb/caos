export const CONTROL_VIEWS = { current: 'A', c: 'C' } as const;
export type ControlViewMode = keyof typeof CONTROL_VIEWS;
