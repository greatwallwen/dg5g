import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

(globalThis as typeof globalThis & { React: typeof React }).React = React;

const root = process.cwd();
const accountMenuPath = path.join(root, 'apps/web/src/features/auth/account-menu.tsx');

test('account menu renders only role, name, and one logout action', async () => {
  assert.equal(existsSync(accountMenuPath), true, 'missing shared AccountMenu');
  if (!existsSync(accountMenuPath)) return;

  const { AccountMenu } = await import(pathToFileURL(accountMenuPath).href) as {
    AccountMenu: React.ComponentType<{ displayName: string; role: 'student' | 'teacher' }>;
  };
  const html = renderToStaticMarkup(
    <AccountMenu displayName="学生一" role="student" />,
  );

  assert.match(html, /data-account-menu="student"/);
  assert.match(html, /aria-busy="false"/);
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /学生\s*·\s*学生一/);
  assert.equal((html.match(/<button\b/g) ?? []).length, 1);
  assert.match(html, /data-account-logout="true"/);
  assert.match(html, /退出登录/);
  assert.doesNotMatch(html, /切换账号|个人中心|设置|<details|<summary/);
});

test('account menu reuses server logout and exposes only textual busy and failure states', () => {
  const source = read(accountMenuPath);

  assert.match(source, /logoutCurrentActor/);
  assert.match(source, /window\.location\.replace\(['"]\/['"]\)/);
  assert.match(source, /正在退出/);
  assert.match(source, /退出失败/);
  assert.doesNotMatch(source, /useRouter|SwitchAccount|details|summary|切换账号|个人中心|设置/);
});

test('account menu bounds best-effort cleanup so pending leave cannot trap logout', async () => {
  const { settleBeforeLogout } = await import(pathToFileURL(accountMenuPath).href) as {
    settleBeforeLogout: (cleanup: () => Promise<void>, timeoutMs: number) => Promise<void>;
  };
  let attempted = 0;
  const startedAt = Date.now();

  await settleBeforeLogout(() => {
    attempted += 1;
    return new Promise<void>(() => undefined);
  }, 10);

  assert.equal(attempted, 1);
  assert.ok(Date.now() - startedAt < 250, 'pending cleanup exceeded its logout budget');
  await assert.doesNotReject(
    settleBeforeLogout(async () => { throw new Error('leave failed'); }, 10),
  );
});

test('all authenticated learning and teaching topbars use the shared account menu', () => {
  const coursePage = read('apps/web/src/app/course/page.tsx');
  const courseOverview = read('apps/web/src/features/textbook-scene/course-overview.tsx');
  const roleHomeHeader = read('apps/web/src/features/home/role-home-header.tsx');
  const learnPage = read('apps/web/src/app/learn/[nodeId]/page.tsx');
  const textbookShell = read('apps/web/src/features/textbook-scene/textbook-scene-shell.tsx');
  const classroomPage = read('apps/web/src/app/classroom/[sessionId]/page.tsx');
  const studentClassroom = read('apps/web/src/features/classroom/student-follow-client.tsx');
  const teacherPage = read('apps/web/src/app/teacher/sessions/[sessionId]/page.tsx');
  const teacherClient = read('apps/web/src/features/classroom/teacher-console-client.tsx');
  const teacherView = read('apps/web/src/features/classroom/teacher-console-view.tsx');

  assert.match(coursePage, /const actor = await requireUser\(\)/);
  assert.match(coursePage, /<CourseOverview[\s\S]*displayName=\{actor\.displayName\}[\s\S]*role=\{actor\.role\}/);
  assert.match(courseOverview, /<AccountMenu\s+displayName=\{displayName\}\s+role=\{role\}/);
  assert.doesNotMatch(courseOverview, /readDemoIdentity|logoutCurrentActor|identity\?\.displayName|function logout\(/);
  assert.match(roleHomeHeader, /<AccountMenu\s+displayName=\{displayName\}\s+role=\{role\}/);
  assert.match(learnPage, /displayName=\{actor\.displayName\}/);
  assert.match(textbookShell, /<AccountMenu\s+displayName=\{displayName\}\s+role="student"/);
  assert.match(classroomPage, /displayName=\{actor\.displayName\}/);
  assert.match(studentClassroom, /<AccountMenu[\s\S]*displayName=\{displayName\}[\s\S]*role="student"/);
  assert.match(teacherPage, /displayName=\{actor\.displayName\}/);
  assert.match(teacherClient, /displayName=\{displayName\}/);
  assert.match(teacherView, /<AccountMenu\s+displayName=\{p\.displayName\}\s+role="teacher"/);
});

test('joined student logout attempts to leave class but cannot be blocked by leave failure', () => {
  const source = read('apps/web/src/features/classroom/student-follow-client.tsx');

  assert.match(source, /beforeLogout=/);
  assert.match(source, /participation\.participation\?\.state\s*===\s*['"]joined['"]/);
  assert.match(source, /gateway\.leave\(session\.sessionId\)/);
  assert.match(
    read(accountMenuPath),
    /await settleBeforeLogout\(beforeLogout\);[\s\S]*await logoutCurrentActor\(\)/,
  );
});

test('protected unavailable pages preserve the authenticated account exit', () => {
  const learnPage = read('apps/web/src/app/learn/[nodeId]/page.tsx');
  const unavailable = read('apps/web/src/features/classroom/class-session-unavailable.tsx');
  const studentClassroomPage = read('apps/web/src/app/classroom/[sessionId]/page.tsx');
  const teacherClassroomPage = read('apps/web/src/app/teacher/sessions/[sessionId]/page.tsx');

  assert.match(learnPage, /destination\.kind !== ['"]open['"][\s\S]*<AccountMenu[\s\S]*displayName=\{actor\.displayName\}[\s\S]*role="student"/);
  assert.match(unavailable, /<AccountMenu\s+displayName=\{displayName\}\s+role=\{role\}/);
  assert.match(studentClassroomPage, /<ClassSessionUnavailable[\s\S]*displayName=\{actor\.displayName\}[\s\S]*role="student"/);
  assert.match(teacherClassroomPage, /<ClassSessionUnavailable[\s\S]*displayName=\{actor\.displayName\}[\s\S]*role="teacher"/);
});

test('shared account styles keep a 44px action and remove the obsolete home actor rules', () => {
  const authCss = read('apps/web/src/app/auth.css');
  const roleHomeCss = read('apps/web/src/app/role-home-v5.css');

  assert.match(authCss, /\.account-menu\b/);
  assert.match(authCss, /\.account-menu-logout\b[\s\S]*min-height:\s*44px/);
  assert.match(authCss, /@media\s*\(max-width:\s*720px\)[\s\S]*\.account-menu/);
  assert.doesNotMatch(roleHomeCss, /\.role-home-actor\b/);
});

function read(file: string): string {
  const absolute = path.isAbsolute(file) ? file : path.join(root, file);
  try {
    return readFileSync(absolute, 'utf8');
  } catch {
    return '';
  }
}
