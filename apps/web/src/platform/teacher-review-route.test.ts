import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { resolve } from 'node:path';
import test from 'node:test';

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'next/server') return nextResolve('next/server.js', context);
    if (specifier.startsWith('.') && context.parentURL?.includes('/apps/web/src/')
      && !specifier.endsWith('.ts') && !specifier.endsWith('.tsx')) {
      return nextResolve(`${specifier}.ts`, context);
    }
    return nextResolve(specifier, context);
  },
});

const route = await import('../app/api/teacher/reviews/route.ts');

test('legacy teacher review route is permanently retired without processing spoofed writes', async () => {
  const response = await route.POST(new Request('http://localhost/api/teacher/reviews', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-dgbook-class-role': 'teacher',
      'x-dgbook-teacher-id': 'spoofed-teacher',
    },
    body: JSON.stringify({
      outputId: 'output-01',
      expectedVersion: 3,
      studentId: 'stu-01',
      action: { type: 'verify', score: 100 },
    }),
  }));

  assert.equal(response.status, 410);
  assert.deepEqual(await response.json(), {
    error: 'REVIEW_ENDPOINT_RETIRED',
    message: '旧批阅接口已停用，请从专业产出队列发起批阅。',
    replacement: '/api/teacher/outputs/{outputId}/reviews',
  });
  const source = readFileSync(resolve(
    process.cwd(),
    'apps/web/src/app/api/teacher/reviews/route.ts',
  ), 'utf8');
  assert.doesNotMatch(source, /reviewProfessionalOutput|reviewSubmitted|output_reviews/);
});
