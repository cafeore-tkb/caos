export const CONTROL_VIEWS = { current: 'タイムライン', c: 'キュー' } as const;
export type ControlViewMode = keyof typeof CONTROL_VIEWS;
