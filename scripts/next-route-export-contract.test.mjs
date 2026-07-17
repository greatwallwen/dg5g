import assert from 'node:assert/strict';
import test from 'node:test';
import { findUnsupportedNextRouteRuntimeExports } from './next-route-export-contract.mjs';

test('accepts Next route handlers and configuration while ignoring type-only exports', () => {
  const source = `
    export type RouteContext = { params: { id: string } };
    export interface RouteMetadata { id: string }
    export const dynamic = 'force-dynamic';
    export async function GET() {}
    const handler = () => new Response();
    export { handler as POST, type RouteContext as SharedRouteContext };
  `;

  assert.deepEqual(findUnsupportedNextRouteRuntimeExports(source), []);
});

test('rejects every runtime export form that Next route modules do not support', () => {
  const source = `
    export function helper() {}
    export const GET = () => new Response(), secondaryHelper = true;
    const handler = () => new Response();
    const internalHelper = () => true;
    export { handler as POST, internalHelper as aliasedHelper };
    export default handler;
    export enum RouteMode { Live }
    export * from './shared-route';
  `;

  assert.deepEqual(findUnsupportedNextRouteRuntimeExports(source), [
    '*',
    'RouteMode',
    'aliasedHelper',
    'default',
    'helper',
    'secondaryHelper',
  ]);
});
