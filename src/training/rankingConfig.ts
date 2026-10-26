// Public API origin. Account credentials and tokens never belong in this file.
export const RANKING_API = import.meta.env?.DEV
  ? 'http://localhost:8787'
  : (import.meta.env?.VITE_RANKING_API_URL ?? 'https://caos-training-ranking.210on.workers.dev');
