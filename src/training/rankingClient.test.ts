import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { beginRun, publishRun, readDisplayName, readPending, syncRuns } from './rankingClient';
import { SCORING_VERSION } from './replay';

const originalFetch = globalThis.fetch;
const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
const session = { token: 'a'.repeat(64), player: { id: 'device-a' } };
let data: Map<string, string>;
beforeEach(() => {
  data = new Map();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => {
        data.set(key, value);
      },
      removeItem: (key: string) => {
        data.delete(key);
      },
    },
  });
});
afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalStorage) Object.defineProperty(globalThis, 'localStorage', originalStorage);
  else Reflect.deleteProperty(globalThis, 'localStorage');
});
test('starting a game needs no names or credentials and never publishes a result', async () => {
  const calls: { path: string; body: unknown }[] = [];
  globalThis.fetch = async (input, init) => {
    const path = new URL(String(input)).pathname;
    calls.push({ path, body: JSON.parse(String(init?.body)) });
    if (path === '/session') return Response.json(session);
    assert.equal(path, '/runs');
    return Response.json({ id: 'run-a', seed: 42, rulesVersion: SCORING_VERSION, scenario: {} });
  };
  const game = await beginRun('fast', null);
  assert.equal(game.session.token, session.token);
  assert.deepEqual(calls, [
    { path: '/session', body: {} },
    { path: '/runs', body: { mode: 'fast' } },
  ]);
  assert.equal(readDisplayName(), '');
});
test('an expired invisible device session is replaced without a login prompt', async () => {
  const paths: string[] = [];
  globalThis.fetch = async (input, init) => {
    const path = new URL(String(input)).pathname;
    paths.push(path);
    if (paths.length === 1) return Response.json({ error: 'expired' }, { status: 401 });
    if (path === '/session') return Response.json(session);
    assert.equal(new Headers(init?.headers).get('Authorization'), `Bearer ${session.token}`);
    return Response.json({ id: 'run-a', seed: 42, rulesVersion: SCORING_VERSION, scenario: {} });
  };
  const game = await beginRun('fast', { token: 'b'.repeat(64), player: { id: 'old-device' } });
  assert.equal(game.session.player.id, session.player.id);
  assert.deepEqual(paths, ['/runs', '/session', '/runs']);
});
test('a failed named publication can be retried with its exact display name and actions', async () => {
  globalThis.fetch = async () => {
    throw new Error('offline');
  };
  const actions = [{ type: 'finish' }] as const;
  await assert.rejects(publishRun(session, 'run-a', [...actions], '珈琲係'));
  assert.equal(readPending()[0].displayName, '珈琲係');
  globalThis.fetch = async (input, init) => {
    assert.equal(new URL(String(input)).pathname, '/runs/run-a/submit');
    assert.deepEqual(JSON.parse(String(init?.body)), { actions, displayName: '珈琲係' });
    return Response.json({ result: {} });
  };
  await syncRuns(session);
  assert.deepEqual(readPending(), []);
});
test('online publication still works when browser storage is blocked', async () => {
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    },
  });
  let submitted = false;
  globalThis.fetch = async (_input, init) => {
    assert.equal(JSON.parse(String(init?.body)).displayName, '当日マスター');
    submitted = true;
    return Response.json({ result: {} });
  };
  await publishRun(session, 'run-a', [{ type: 'finish' }], '当日マスター');
  assert.ok(submitted);
});
