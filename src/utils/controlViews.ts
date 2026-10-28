export const CONTROL_VIEWS = { current: 'タイムライン', c: '待ち列' } as const;
export type ControlViewMode = keyof typeof CONTROL_VIEWS;
