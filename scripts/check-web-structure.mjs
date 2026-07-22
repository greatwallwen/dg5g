import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const cwd = process.cwd();
const root = exists(join(cwd, 'apps', 'web', 'src')) ? cwd : exists(join(cwd, 'src')) ? join(cwd, '..', '..') : cwd;
const sourceRoot = join(root, 'apps', 'web', 'src');
const maxSourceLines = 800;
const maxSpecialLines = 1000;
const maxRouteLines = 120;
const maxFeatureComponentLines = 250;
const failures = [];
const appRoot = join(sourceRoot, 'app');
const classroomRoot = join(sourceRoot, 'features', 'classroom');
const platformRoot = join(sourceRoot, 'platform');

if (!exists(sourceRoot)) {
  fail('apps/web/src not found');
  finish();
}

if (exists(appRoot)) {
  for (const dir of walkDirs(appRoot)) {
    const name = dir.split(sep).pop() ?? '';
    if (/^\(.+\)$/.test(name)) fail(`${slash(relative(root, dir))} route group directory is not allowed`);
  }
}

for (const file of walk(sourceRoot)) {
  const rel = slash(relative(root, file));
  if (/\.(js|jsx|cjs|mjs)$/.test(file)) {
    fail(`${rel} must be TypeScript, CSS, or a static route asset; JS source is not allowed in apps/web/src`);
    continue;
  }
  if (!/\.(ts|tsx|css)$/.test(file)) continue;
  const text = readFileSync(file, 'utf8');
  const lines = countLines(text);
  const limit = rel.endsWith('/globals.css') ? maxSpecialLines : maxSourceLines;

  if (lines > limit) fail(`${rel} has ${lines} lines, limit ${limit}`);
  if (isRoutePage(rel) && lines > maxRouteLines) fail(`${rel} route has ${lines} lines, limit ${maxRouteLines}`);
  if (isFeatureComponent(rel) && lines > maxFeatureComponentLines) {
    fail(`${rel} component has ${lines} lines, limit ${maxFeatureComponentLines}`);
  }
  if (/@\/components|@\/lib/.test(text)) fail(`${rel} imports legacy @/components or @/lib path`);
}

checkClassroomStateContract();
checkAuthoritativeDomSurfaceContract();
checkStudentFollowRuntimeContract();
checkClassroomRosterSourceContract();
checkTeacherReviewContract();
checkStudentRailAndCourseAvailabilityContract();
checkClassSessionApiContract();
checkNextPlatformIsolationContract();
checkProjectAccessContract();
checkPlaybackAudioContract();
checkRoleLoginContract();
checkHomeRoleGatewayContract();
checkActivityQuestionContract();
checkP1LearningLoopContract();
checkDemoSeedContract();
checkCanonicalLearningPolicyContract();
checkGraphicSystemContract();
checkNextDefaultEntrypointContract();
checkDgbookCliContract();
checkWebReleaseScriptContract();
checkCurrentDocsContract();

finish();

function walk(dir) {
  const entries = readdirSync(dir);
  const files = [];
  for (const entry of entries) {
    const file = join(dir, entry);
    const stat = statSync(file);
    if (stat.isDirectory()) files.push(...walk(file));
    else files.push(file);
  }
  return files;
}

function walkDirs(dir) {
  const entries = readdirSync(dir);
  const dirs = [];
  for (const entry of entries) {
    const file = join(dir, entry);
    const stat = statSync(file);
    if (stat.isDirectory()) {
      dirs.push(file);
      dirs.push(...walkDirs(file));
    }
  }
  return dirs;
}

function countLines(text) {
  if (!text) return 0;
  return text.split(/\r?\n/).length;
}

function generatedP1NodeIds() {
  const generatedFile = join(root, 'textbook', '5g', 'generated', 'p1-demo-content.json');
  if (!exists(generatedFile)) {
    fail('textbook/5g/generated/p1-demo-content.json is required as the P1 textbook source');
    return [];
  }
  try {
    const content = JSON.parse(readFileSync(generatedFile, 'utf8'));
    if (content?.schema !== 'dgbook.p1-demo-content/v1' || !Array.isArray(content.tasks)) {
      fail('generated P1 textbook must expose the dgbook.p1-demo-content/v1 contract');
      return [];
    }
    return content.tasks.flatMap((task) => Array.isArray(task?.nodes) ? task.nodes.map((node) => node?.id) : []);
  } catch {
    fail('generated P1 textbook must contain valid JSON');
    return [];
  }
}

function isRoutePage(rel) {
  return rel.startsWith('apps/web/src/app/') && rel.endsWith('/page.tsx');
}

function isFeatureComponent(rel) {
  const inFeature = rel.startsWith('apps/web/src/features/') || rel.startsWith('apps/web/src/ui/');
  return inFeature && rel.endsWith('.tsx');
}

function slash(value) {
  return value.split(sep).join('/');
}

function exists(file) {
  try {
    statSync(file);
    return true;
  } catch {
    return false;
  }
}

function isDigitalTextbookV3() {
  return exists(join(appRoot, 'course', 'page.tsx'))
    && exists(join(sourceRoot, 'features', 'capability-map', 'semantic-course-graph.tsx'))
    && exists(join(sourceRoot, 'features', 'textbook-scene', 'textbook-scene-shell.tsx'));
}

function readFixtureSourcesText() {
  const fixturesRoot = join(platformRoot, 'fixtures');
  const fixtureFiles = [
    join(platformRoot, 'fixtures.ts'),
    join(fixturesRoot, 'ids.ts'),
    join(fixturesRoot, 'base-fixtures.ts'),
    join(fixturesRoot, 'learning-fixtures.ts'),
    join(fixturesRoot, 'session-profiles.ts'),
    join(fixturesRoot, 'session-fixtures.ts'),
    join(fixturesRoot, 'capability-fixtures.ts'),
    join(fixturesRoot, 'platform-fixtures.ts'),
  ];
  return fixtureFiles.filter(exists).map((file) => readFileSync(file, 'utf8')).join('\n');
}

function fail(message) {
  failures.push(message);
}

function checkNextPlatformIsolationContract() {
  const packageFile = join(root, 'apps', 'web', 'package.json');
  if (exists(packageFile)) {
    const packageText = readFileSync(packageFile, 'utf8');
    for (const forbidden of ['astro']) {
      if (packageText.includes(forbidden)) {
        fail(`apps/web/package.json must not depend on legacy ${forbidden}`);
      }
    }
  }

  for (const file of walk(sourceRoot)) {
    if (!/\.(ts|tsx)$/.test(file)) continue;
    const rel = slash(relative(root, file));
    const text = readFileSync(file, 'utf8');
    for (const line of text.split(/\r?\n/)) {
      if (!/^\s*(import|export)\b/.test(line)) continue;
      if (/@dgbook\/site|(?:^|['"\\\/])site[\\\/]|(?:^|['"\\\/])textbook[\\\/]|\bastro\b/.test(line)) {
        fail(`${rel} imports legacy site, textbook, or Astro runtime`);
      }
    }
  }
}

function checkClassroomStateContract() {
  const stateModule = join(classroomRoot, 'classroom-session-state.ts');
  if (!exists(stateModule)) {
    fail('apps/web/src/features/classroom/classroom-session-state.ts is required');
    return;
  }

  const stateText = readFileSync(stateModule, 'utf8');
  for (const exported of ['studentControlSource', 'syncReceiptState']) {
    if (!stateText.includes(`export function ${exported}`)) {
      fail(`classroom-session-state.ts must export ${exported}`);
    }
  }

  const consumers = [
    ['student-supervision-roster.tsx', ['syncReceiptState']],
  ];
  for (const [name, imports] of consumers) {
    const file = join(classroomRoot, name);
    if (!exists(file)) {
      fail(`apps/web/src/features/classroom/${name} is required`);
      continue;
    }
    const text = readFileSync(file, 'utf8');
    if (!text.includes('./classroom-session-state')) {
      fail(`${slash(relative(root, file))} must consume classroom-session-state.ts`);
    }
    for (const imported of imports) {
      if (!text.includes(imported)) {
        fail(`${slash(relative(root, file))} must use ${imported}`);
      }
    }
  }

  const teacherConsole = join(classroomRoot, 'teacher-console-client.tsx');
  if (exists(teacherConsole)) {
    const teacherView = join(classroomRoot, 'teacher-console-view.tsx');
    const clientText = readFileSync(teacherConsole, 'utf8');
    const text = [teacherConsole, teacherView].filter(exists).map((file) => readFileSync(file, 'utf8')).join('\n');
    for (const snippet of ['useAuthoritativeSnapshot', 'projectTeacherConsoleSnapshot', 'initialSnapshot']) {
      if (!clientText.includes(snippet)) fail(`teacher-console-client.tsx must consume the authoritative snapshot through ${snippet}`);
    }
    for (const forbidden of ['getRosterStats', 'teacherControlMode', 'submittedFormalScores', 'commandDeliveryStats', '.filter(', '.reduce(']) {
      if (clientText.includes(forbidden)) fail(`teacher-console-client.tsx must not re-aggregate authoritative facts through ${forbidden}`);
    }
    if (!text.includes('data-teacher-control-mode={controlMode}') && !text.includes('data-teacher-control-mode={p.controlMode}')) {
      fail('teacher-console-client.tsx must expose derived data-teacher-control-mode');
    }
  }

  const authoritativePages = [
    [join(appRoot, 'teacher', 'sessions', '[sessionId]', 'page.tsx'), "read(actor, 'teacher'"],
    [join(appRoot, 'present', '[sessionId]', 'page.tsx'), "read(actor, 'projector'"],
  ];
  for (const [file, audienceRead] of authoritativePages) {
    if (!exists(file)) {
      fail(`${slash(relative(root, file))} is required`);
      continue;
    }
    const text = readFileSync(file, 'utf8');
    for (const snippet of ['AuthoritativeSnapshotReader', audienceRead, 'sessionId: params.sessionId']) {
      if (!text.includes(snippet)) fail(`${slash(relative(root, file))} must read the authoritative snapshot through ${snippet}`);
    }
  }

  const projectorClient = join(classroomRoot, 'projector-client.tsx');
  if (exists(projectorClient)) {
    const projectorText = readFileSync(projectorClient, 'utf8');
    for (const snippet of ['useAuthoritativeSnapshot', 'snapshot.submissions.activeAssessment']) {
      if (!projectorText.includes(snippet)) fail(`projector-client.tsx must consume the authoritative snapshot through ${snippet}`);
    }
    for (const forbidden of ['anonymousProgress', 'formalTest?.participants', 'participants: studentRoster.map', '.filter(', '.reduce(']) {
      if (projectorText.includes(forbidden)) fail(`projector-client.tsx must not build anonymous person rows or re-aggregate through ${forbidden}`);
    }
  }

  const followPageFile = join(appRoot, 'classroom', '[sessionId]', 'page.tsx');
  if (exists(followPageFile)) {
    const followPageText = readFileSync(followPageFile, 'utf8');
    for (const snippet of [
      "const actor = await requireClassRole('student')",
      'loadStudentFollowPage(getDatabase(), actor, params.sessionId)',
      'initialParticipation={data.participation}',
      'studentId={actor.studentId}',
    ]) {
      if (!followPageText.includes(snippet)) {
        fail('classroom/[sessionId]/page.tsx must derive student scope from the server actor via ' + snippet);
      }
    }
    const guardIndex = followPageText.indexOf("requireClassRole('student')");
    for (const loader of ['loadStudentFollowPage(getDatabase(), actor, params.sessionId)']) {
      if (guardIndex < 0 || followPageText.indexOf(loader) < guardIndex) {
        fail('classroom/[sessionId]/page.tsx must authorize before ' + loader);
      }
    }
    for (const forbidden of ['searchParams', 'readDemoIdentity', 'writeDemoIdentity', 'localStorage', 'sessionStorage', 'x-dgbook-class-role']) {
      if (followPageText.includes(forbidden)) {
        fail('classroom/[sessionId]/page.tsx must not derive student authority from ' + forbidden);
      }
    }
  }
}

function checkAuthoritativeDomSurfaceContract() {
  const surfaces = [
    join(sourceRoot, 'features', 'home', 'student-home.tsx'),
    join(classroomRoot, 'teacher-console-view.tsx'),
    join(classroomRoot, 'projector-client.tsx'),
    join(sourceRoot, 'features', 'textbook-scene', 'course-overview.tsx'),
  ];
  const attributes = [
    'data-snapshot-version',
    'data-classroom-revision',
    'data-class-size',
    'data-formal-submitted',
    'data-formal-passed',
  ];
  for (const file of surfaces) {
    if (!exists(file)) {
      fail(`${slash(relative(root, file))} is required for authoritative DOM evidence`);
      continue;
    }
    const text = readFileSync(file, 'utf8');
    for (const attribute of attributes) {
      if (!text.includes(attribute)) fail(`${slash(relative(root, file))} must expose authoritative DOM evidence through ${attribute}`);
    }
  }
}

function checkStudentFollowRuntimeContract() {
  const pageFile = join(appRoot, 'classroom', '[sessionId]', 'page.tsx');
  const loaderFile = join(classroomRoot, 'student-follow-loader.ts');
  const clientFile = join(classroomRoot, 'student-follow-client.tsx');
  const runtimeFile = join(classroomRoot, 'student-follow-runtime.ts');
  const rendererFile = join(classroomRoot, 'classroom-follow-renderer.tsx');
  const pollerFile = join(classroomRoot, 'use-class-session.ts');
  const stylesFile = join(appRoot, 'student-classroom-runtime.css');
  const participationClientFile = join(classroomRoot, 'classroom-participation-client.ts');
  const participationRouteFile = join(appRoot, 'api', 'class-sessions', '[sessionId]', 'participation', 'route.ts');
  const files = [pageFile, loaderFile, clientFile, runtimeFile, rendererFile, pollerFile, stylesFile, participationClientFile, participationRouteFile];
  for (const file of files) {
    if (!exists(file)) fail(`${slash(relative(root, file))} is required for the student classroom participation runtime`);
  }
  if (!files.every(exists)) return;

  const pageText = readFileSync(pageFile, 'utf8');
  const loaderText = readFileSync(loaderFile, 'utf8');
  const clientText = readFileSync(clientFile, 'utf8');
  const runtimeText = readFileSync(runtimeFile, 'utf8');
  const rendererText = readFileSync(rendererFile, 'utf8');
  const pollerText = readFileSync(pollerFile, 'utf8');
  const stylesText = readFileSync(stylesFile, 'utf8');
  const participationClientText = readFileSync(participationClientFile, 'utf8');
  const participationRouteText = readFileSync(participationRouteFile, 'utf8');

  for (const snippet of ['loadStudentFollowPage(getDatabase(), actor, params.sessionId)', 'ClassSessionUnavailable', 'initialParticipation={data.participation}']) {
    if (!pageText.includes(snippet)) fail(`student classroom page must load one exact SQLite session through ${snippet}`);
  }
  for (const forbidden of ['isActiveDemoSession', 'getStudentFollowState', 'mock-api', 'P1T1-N01']) {
    if (pageText.includes(forbidden)) fail(`student classroom page must not restore the legacy node-session fallback through ${forbidden}`);
  }

  for (const snippet of ['sessionRepository.readSession(sessionId)', 'participationRepository.read(sessionId, studentId)', 'SelfStudyCursorRepository', "href: '/student/home'"]) {
    if (!loaderText.includes(snippet)) fail(`student-follow-loader.ts must derive an exact read-only actor projection through ${snippet}`);
  }
  for (const forbidden of ['.join(', 'joinClassroomParticipation', 'P1T1-N01']) {
    if (loaderText.includes(forbidden)) fail(`student-follow-loader.ts must never join or invent a fallback through ${forbidden}`);
  }

  for (const snippet of ['createClassroomParticipationClient', 'joinStudentClassroom', 'changeStudentClassroomMode', 'leaveStudentClassroom', 'ClassroomStudentModeRenderer', 'participationMode: mode']) {
    if (!clientText.includes(snippet)) fail(`student-follow-client.tsx must use durable participation and the dedicated renderer through ${snippet}`);
  }
  for (const forbidden of ['studentControlSource', 'scene-follow-path', 'setSelfIndex', 'studentSyncState === \'forced\'', 'self-study-cursor-client']) {
    if (clientText.includes(forbidden)) fail(`student-follow-client.tsx must not restore mixed self/follow state through ${forbidden}`);
  }

  for (const snippet of ['await gateway.leave(sessionId)', 'navigate(href)']) {
    if (!runtimeText.includes(snippet)) fail(`student-follow-runtime.ts must persist leave before navigation through ${snippet}`);
  }
  for (const snippet of ['data-classroom-current-unit', 'data-teacher-task', 'data-classroom-activity', 'data-return-self-study', 'data-classroom-self-status', 'data-classroom-entry-status']) {
    if (!rendererText.includes(snippet)) fail(`classroom-follow-renderer.tsx must expose the focused classroom regions through ${snippet}`);
  }

  for (const snippet of ['createClassSessionPoller', 'resolvePollTier', 'participationMode', 'visibilitychange']) {
    if (!pollerText.includes(snippet)) fail(`use-class-session.ts must use completion-scheduled lifecycle polling through ${snippet}`);
  }

  for (const snippet of ['.classroom-follow-renderer', '.classroom-follow-current', '.classroom-follow-task', '.classroom-follow-activity', '.classroom-follow-return', '@media (max-width: 720px)']) {
    if (!stylesText.includes(snippet)) fail(`student-classroom-runtime.css must style the focused classroom regions through ${snippet}`);
  }
  for (const forbidden of ['setInterval', 'ACTIVE_POLL_INTERVAL_MS', '400']) {
    if (pollerText.includes(forbidden)) fail(`use-class-session.ts must not restore the old hot polling loop through ${forbidden}`);
  }

  for (const snippet of ["method: 'GET'", "method: 'PUT'", "method: 'PATCH'", "method: 'DELETE'", "credentials: 'same-origin'"]) {
    if (!participationClientText.includes(snippet)) fail(`classroom-participation-client.ts must expose the actor-cookie protocol through ${snippet}`);
  }
  for (const snippet of ['export function GET', 'export async function PUT', 'export async function PATCH', 'export async function DELETE', 'readActorFromRequest(request)', 'isExactModeBody']) {
    if (!participationRouteText.includes(snippet)) fail(`participation route must authorize and parse exact commands through ${snippet}`);
  }
}

function checkClassSessionApiContract() {
  const routeFile = join(appRoot, 'api', 'class-sessions', '[sessionId]', 'route.ts');
  const actionFile = join(platformRoot, 'student-classroom-action.ts');
  const actionServiceFile = join(platformRoot, 'student-classroom-action-service.ts');
  const classroomServiceFile = join(platformRoot, 'classroom-session-service.ts');
  const protocolFile = join(platformRoot, 'class-session-protocol.ts');
  const projectionFile = join(platformRoot, 'class-session-projection.ts');
  const mockApiFile = join(platformRoot, 'mock-api.ts');
  const transportFile = join(classroomRoot, 'classroom-transport.ts');

  for (const file of [routeFile, actionFile, actionServiceFile, classroomServiceFile, protocolFile, projectionFile, mockApiFile, transportFile]) {
    if (!exists(file)) fail(slash(relative(root, file)) + ' is required for the server-authorized class-session contract');
  }
  if (![routeFile, actionFile, actionServiceFile, classroomServiceFile, protocolFile, projectionFile, mockApiFile, transportFile].every(exists)) return;

  const routeText = readFileSync(routeFile, 'utf8');
  for (const snippet of [
    'readActorFromRequest(request)',
    'ClassroomSessionService',
    'actor.studentId',
    "searchParams.get('view') === 'projector'",
    'projectClassSession',
    'parseStudentClassroomAction(body.action)',
    'applyStudentClassroomAction(params.sessionId, actor.studentId, action)',
    'if (body.patch !== undefined)',
    'Students must use a narrow classroom action',
    'classroom.patchTeacherState(',
    'expectedRevision',
  ]) {
    if (!routeText.includes(snippet)) fail('class-sessions API route must enforce cookie-actor authority via ' + snippet);
  }

  const classroomServiceText = readFileSync(classroomServiceFile, 'utf8');
  for (const snippet of ['actor.classId !== session.classId', 'actor.userId !== session.teacherId', 'ClassroomRevisionConflictError']) {
    if (!classroomServiceText.includes(snippet)) fail('ClassroomSessionService must enforce SQLite actor/CAS authority via ' + snippet);
  }

  const actionText = readFileSync(actionFile, 'utf8');
  for (const snippet of [
    'export type StudentClassroomAction',
    "type: 'navigation_changed'",
    "type: 'activity_submitted'",
    "type: 'refresh'",
    'hasExactKeys',
  ]) {
    if (!actionText.includes(snippet)) fail('StudentClassroomAction must be exact-key parsed through ' + snippet);
  }

  const serviceText = readFileSync(actionServiceFile, 'utf8');
  for (const snippet of [
    'applyStudentClassroomAction',
    'ClassroomParticipationRepository',
    'LearningRepository',
    "'classroom_activity_submitted'",
    'return getClassSession(sessionId)',
  ]) {
    if (!serviceText.includes(snippet)) fail('student classroom writes must be server-derived through ' + snippet);
  }
  if (serviceText.includes('patchStudentClassroomProgress')) {
    fail('student classroom actions must never return an unpersisted progress overlay');
  }

  const protocolText = readFileSync(protocolFile, 'utf8');
  if (!/student:\s*\[\]/.test(protocolText)) {
    fail('generic student SessionPatch writes must stay disabled');
  }

  const projectionText = readFileSync(projectionFile, 'utf8');
  for (const snippet of [
    'export function projectClassSession',
    "role === 'student'",
    "role === 'projector'",
    'Student projection requires an authenticated student ID',
    'ProjectorClassSession',
  ]) {
    if (!projectionText.includes(snippet)) fail('class-session projections must sanitize audiences through ' + snippet);
  }
  if (projectionText.includes('anonymous-')) {
    fail('projector projection must not retain linkable anonymous participant rows');
  }

  const mockApiText = readFileSync(mockApiFile, 'utf8');
  for (const snippet of [
    "projectClassSession(teacher.session, 'projector')",
    "projectClassSession(teacher.session, 'student', studentId)",
  ]) {
    if (!mockApiText.includes(snippet)) fail('initial classroom loaders must share projectClassSession via ' + snippet);
  }

  const transportText = readFileSync(transportFile, 'utf8');
  for (const snippet of [
    "credentials: 'same-origin'",
    'void studentId',
    'studentClassroomActionFromPatch',
    'patchInit({ action })',
    "role === 'projector' ? `${base}?view=projector` : base",
  ]) {
    if (!transportText.includes(snippet)) fail('classroom transport must rely on the HttpOnly cookie via ' + snippet);
  }

  const authoritySources = [
    [routeFile, routeText],
    [transportFile, transportText],
  ];
  for (const [file, text] of authoritySources) {
    for (const forbidden of [
      'x-dgbook-class-role',
      'readDemoIdentity',
      'writeDemoIdentity',
      'localStorage',
      'sessionStorage',
      "searchParams.get('role')",
      "searchParams.get('student')",
      'body.role',
      'body.studentId',
      '?role=',
      '?student=',
      '&role=',
      '&student=',
    ]) {
      if (text.includes(forbidden)) {
        fail(slash(relative(root, file)) + ' must not derive class-session authority from ' + forbidden);
      }
    }
  }
}

function checkTeacherReviewContract() {
  const teacherView = join(classroomRoot, 'teacher-console-view.tsx');
  const teacherInspector = join(classroomRoot, 'teacher-console-inspector.tsx');
  const reviewPanel = join(sourceRoot, 'features', 'review', 'output-review-panel.tsx');
  const listRoute = join(appRoot, 'api', 'teacher', 'outputs', 'route.ts');
  const commandRoute = join(appRoot, 'api', 'teacher', 'outputs', '[outputId]', 'reviews', 'route.ts');
  const retiredRoute = join(appRoot, 'api', 'teacher', 'reviews', 'route.ts');
  const reviewStore = join(platformRoot, 'professional-output-review-store.ts');
  const files = [teacherView, teacherInspector, reviewPanel, listRoute, commandRoute, retiredRoute, reviewStore];
  for (const file of files) {
    if (!exists(file)) fail(slash(relative(root, file)) + ' is required for professional output review');
  }
  if (!files.every(exists)) return;

  const viewText = readFileSync(teacherView, 'utf8');
  const inspectorText = readFileSync(teacherInspector, 'utf8');
  if (!viewText.includes('<TeacherConsoleInspector p={p}')) fail('teacher console must render the extracted inspector');
  if (!inspectorText.includes('<OutputReviewPanel')) fail('teacher inspector must render the real output review queue');

  const panelText = readFileSync(reviewPanel, 'utf8');
  for (const snippet of ["fetch('/api/teacher/outputs'", '/api/teacher/outputs/${selected.outputId}/reviews',
    'selected.rubric.map', 'selected.fieldSchema.map', 'expectedStateRevision', 'rubricScores']) {
    if (!panelText.includes(snippet)) fail('output review panel must use the generated-schema API through ' + snippet);
  }
  if (/const\s+rubric\s*=/.test(panelText)) fail('output review panel must not define a second rubric source');

  const listText = readFileSync(listRoute, 'utf8');
  for (const snippet of ['readActorFromRequest', "actor.role !== 'teacher'", 'professionalOutputSchemaForTask',
    'fieldSchema:', 'rubric:']) {
    if (!listText.includes(snippet)) fail('teacher output queue must authorize and project generated schema through ' + snippet);
  }

  const commandText = readFileSync(commandRoute, 'utf8');
  for (const snippet of ['readActorFromRequest', "actor.role !== 'teacher'", 'validateRubricScores',
    'professionalOutputSchemaForTask', 'reviewSubmitted']) {
    if (!commandText.includes(snippet)) fail('teacher output review command must validate and transact through ' + snippet);
  }
  for (const forbidden of ['x-dgbook-class-role', 'request.headers.get', 'body.teacherId', 'body.studentId', 'body.classId']) {
    if (commandText.includes(forbidden)) fail('teacher output review route must not infer authority from ' + forbidden);
  }

  const retiredText = readFileSync(retiredRoute, 'utf8');
  for (const snippet of ['REVIEW_ENDPOINT_RETIRED', 'replacement:', '{ status: 410 }']) {
    if (!retiredText.includes(snippet)) fail('legacy teacher review route must be explicitly retired through ' + snippet);
  }
  for (const forbidden of ['readActorFromRequest', 'reviewProfessionalOutput', 'reviewSubmitted']) {
    if (retiredText.includes(forbidden)) fail('retired teacher review route must not retain business writes through ' + forbidden);
  }
}

function checkStudentRailAndCourseAvailabilityContract() {
  const sceneCss = join(appRoot, 'textbook-scene.css');
  const graphCss = join(appRoot, 'capability-map.css');
  const graphElements = join(sourceRoot, 'features', 'capability-map', 'semantic-graph-elements.tsx');
  const graphFixtures = join(platformRoot, 'fixtures', 'curriculum-graph-fixtures.ts');
  const learningScene = join(sourceRoot, 'features', 'textbook-scene', 'learning-scene.tsx');
  const runtimeAudit = join(root, 'scripts', 'audit-web-runtime.mjs');
  for (const file of [sceneCss, graphCss, graphElements, graphFixtures, learningScene, runtimeAudit]) {
    if (!exists(file)) fail(`${slash(relative(root, file))} is required for student rail and course availability`);
  }
  if (![sceneCss, graphCss, graphElements, graphFixtures].every(exists)) return;

  const sceneText = readFileSync(sceneCss, 'utf8');
  for (const snippet of [
    'grid-template-columns: 134px minmax(0,1fr) 260px',
    'border-left: 1px solid #cdd8e4',
    'padding: 16px 13px 92px',
    '.learning-scene { width: 100%',
  ]) {
    if (!sceneText.includes(snippet)) fail(`student follow activity rail must match the left rail through ${snippet}`);
  }

  const elementsText = readFileSync(graphElements, 'utf8');
  for (const snippet of ['projectNodeAccess', 'projectTaskAccess', 'NodeAccessProjection', 'access.disabled']) {
    if (!elementsText.includes(snippet)) fail(`semantic graph must consume canonical node access through ${snippet}`);
  }
  if (elementsText.includes("tasks.find((item) => item.taskId === 'P01')")) {
    fail('semantic graph achievement lookup must not hard-code P01');
  }

  const graphCssText = readFileSync(graphCss, 'utf8');
  for (const snippet of ['.curriculum-node.is-verified', '.node-verified-ring']) {
    if (!graphCssText.includes(snippet)) fail(`capability map must style teacher certification through ${snippet}`);
  }

  const fixtureText = readFileSync(graphFixtures, 'utf8');
  for (let project = 3; project <= 18; project += 1) {
    const id = `P${String(project).padStart(2, '0')}`;
    if (!fixtureText.includes(`graphNode('${id}'`) || !new RegExp(`graphNode\\('${id}'[\\s\\S]{0,260}locked: true`).test(fixtureText)) {
      fail(`course graph must show ${id} as a locked gray course`);
    }
  }

  const learningText = readFileSync(learningScene, 'utf8');
  for (const snippet of ['data-image2-learning-stage="true"', 'learning-case-visual', '<SceneVisual visualId={unit.visualId}']) {
    if (!learningText.includes(snippet)) fail(`learning scene must fill the Image2 stage through ${snippet}`);
  }

  const runtimeText = readFileSync(runtimeAudit, 'utf8');
  for (const snippet of [
    '/api/auth/login',
    '/api/snapshot?audience=${audience}&sessionId=demo-class',
    "readAudienceSnapshot(studentOne, 'student')",
    "readAudienceSnapshot(teacher, 'teacher')",
    "readAudienceSnapshot(teacher, 'projector')",
    "readAudienceSnapshot(studentOne, 'graph')",
    'assertCommonSnapshotFacts',
    'assertProjectorPrivacy',
    'student01',
    'student02',
    "['stu-01', 'stu-02', 'stu-03']",
    'DGBOOK_AUDIT_ISOLATED_SQLITE',
    "eventType: 'section_completed'",
  ]) {
    if (!runtimeText.includes(snippet)) fail(`runtime audit must prove the authoritative four-audience snapshot through ${snippet}`);
  }
  for (const forbidden of ['x-dgbook-class-role', 'localStorage', "method: 'DELETE'"]) {
    if (runtimeText.includes(forbidden)) fail(`runtime audit must not rely on legacy mutation/auth through ${forbidden}`);
  }
}

function checkProjectAccessContract() {
  if (isDigitalTextbookV3()) {
    const fixturesText = readFixtureSourcesText();
    for (const snippet of ["export const activeDemoProjectId = 'P1'", "export const activeDemoNodeId = 'P1T1-N01'"]) {
      if (!fixturesText.includes(snippet)) fail(`v3 access fixtures must include ${snippet}`);
    }
    for (const projectId of ['P2', 'P3', 'P4', 'P5', 'P6']) {
      if (!new RegExp(`project\\('${projectId}'[\\s\\S]*?'locked'`).test(fixturesText)) fail(`v3 course map must keep ${projectId} locked`);
    }
    const accessFile = join(platformRoot, 'access-control.ts');
    const nextConfig = join(root, 'apps', 'web', 'next.config.mjs');
    if (!exists(accessFile)) fail('v3 textbook requires platform/access-control.ts');
    if (!exists(nextConfig)) fail('v3 textbook requires apps/web/next.config.mjs');
    else {
      const text = readFileSync(nextConfig, 'utf8');
      for (const route of ['/projects/:path*', '/tasks/:path*', '/samples/:path*', '/maps/:path*']) {
        if (!text.includes(route)) fail(`next.config.mjs must redirect obsolete route ${route}`);
      }
    }
    return;
  }
  const fixturesFile = join(platformRoot, 'fixtures.ts');
  const mockApiFile = join(platformRoot, 'mock-api.ts');
  const accessControlFile = join(platformRoot, 'access-control.ts');
  const projectPageFile = join(appRoot, 'projects', '[projectId]', 'page.tsx');
  const taskPageFile = join(appRoot, 'tasks', '[taskId]', 'page.tsx');

  if (!exists(fixturesFile)) {
    fail('apps/web/src/platform/fixtures.ts is required');
    return;
  }

  const fixturesText = readFixtureSourcesText();
  if (!fixturesText.includes("export const activeDemoProjectId = 'P1'")) {
    fail('fixture modules must keep P1 as the only open demo project');
  }
  if (!fixturesText.includes("export const activeDemoTaskId = 'P1-T1'")) {
    fail('fixture modules must start the demo learning path from P1-T1');
  }
  if (!fixturesText.includes("export const activeDemoNodeId = 'P1T1-N01'")) {
    fail('fixture modules must start the demo learning path from P1T1-N01');
  }

  for (const lockedProjectId of ['P2', 'P3', 'P4', 'P5', 'P6']) {
    const pattern = new RegExp(`project\\('${lockedProjectId}'[\\s\\S]*?'locked'`);
    if (!pattern.test(fixturesText)) {
      fail(`fixture modules must keep ${lockedProjectId} locked in the current sample`);
    }
  }

  if (!exists(accessControlFile)) {
    fail('apps/web/src/platform/access-control.ts is required');
  } else {
    const accessText = readFileSync(accessControlFile, 'utf8');
    for (const exported of ['resolveProjectId', 'resolveTaskId', 'resolveNodeId', 'resolveSessionId']) {
      if (!accessText.includes(`export function ${exported}`)) {
        fail(`access-control.ts must export ${exported}`);
      }
    }
  }

  if (exists(mockApiFile)) {
    const mockText = readFileSync(mockApiFile, 'utf8');
    if (!mockText.includes("from './access-control'")) {
      fail('mock-api.ts must delegate access rules to access-control.ts');
    }
    for (const resolver of ['resolveProjectId', 'resolveTaskId', 'resolveNodeId', 'resolveSessionId']) {
      if (!mockText.includes(resolver)) fail(`mock-api.ts must use ${resolver}`);
    }
    if (!mockText.includes("getChapterCapabilityMap(chapterId = 'ch1')")) {
      fail('mock-api.ts must default chapter capability maps to ch1 for the P1-only sample');
    }
  }

  if (exists(projectPageFile)) {
    const pageText = readFileSync(projectPageFile, 'utf8');
    if (!pageText.includes('LockedProjectNotice')) {
      fail('projects/[projectId]/page.tsx must render a locked notice for unopened projects');
    }
    if (!pageText.includes('!isActiveDemoProject(params.projectId)')) {
      fail('projects/[projectId]/page.tsx must guard unopened projects');
    }
  }

  if (exists(taskPageFile)) {
    const taskText = readFileSync(taskPageFile, 'utf8');
    if (!taskText.includes("redirect('/tasks/P1-T1')")) {
      fail('tasks/[taskId]/page.tsx must redirect invalid tasks to P1-T1');
    }
  }
}

function checkPlaybackAudioContract() {
  const fixturesFile = join(platformRoot, 'fixtures.ts');
  if (!exists(fixturesFile)) return;

  const fixturesText = readFixtureSourcesText();
  const start = fixturesText.indexOf('export function playbackSceneForSession');
  const end = fixturesText.indexOf('export const courseCapabilityMap');
  if (start < 0 || end < start) {
    fail('fixture modules must define playbackSceneForSession before capability map fixtures');
    return;
  }

  const playbackBlock = fixturesText.slice(start, end);
  const speechAudioSuffixes = [...playbackBlock.matchAll(/audioId: `\$\{prefix\}-stage-speech-(\d+)`/g)]
    .map((match) => match[1]);
  if (speechAudioSuffixes.length < 3) {
    fail('playbackSceneForSession must map at least three speech actions to Qwen audio ids');
  }
  if (new Set(speechAudioSuffixes).size !== speechAudioSuffixes.length) {
    fail('playbackSceneForSession must not reuse the same Qwen audio id for multiple speech actions');
  }
}

function checkRoleLoginContract() {
  const authRoot = join(sourceRoot, 'features', 'auth');
  const roleSession = join(authRoot, 'role-session.ts');
  const roleGate = join(authRoot, 'role-gate.tsx');
  const loginPage = join(authRoot, 'login-page.tsx');
  const serverActor = join(platformRoot, 'auth', 'server-actor.ts');
  const rootPage = join(appRoot, 'page.tsx');
  const requiredFiles = [roleSession, roleGate, loginPage, serverActor, rootPage, join(appRoot, 'auth.css')];
  for (const file of requiredFiles) {
    if (!exists(file)) fail(slash(relative(root, file)) + ' is required for cookie-backed role login');
  }
  if (!requiredFiles.every(exists)) return;

  const roleSessionText = readFileSync(roleSession, 'utf8');
  for (const snippet of ["fetch('/api/auth/me'", "fetch('/api/auth/logout'", "credentials: 'same-origin'", 'parsePublicActor']) {
    if (!roleSessionText.includes(snippet)) fail('role-session.ts must consume the server actor via ' + snippet);
  }
  for (const forbidden of ['writeDemoIdentity', 'localStorage', 'sessionStorage', 'webRoleStorageKey']) {
    if (roleSessionText.includes(forbidden)) fail('role-session.ts must not own authorization state through ' + forbidden);
  }

  const roleGateText = readFileSync(roleGate, 'utf8');
  for (const snippet of ['requiredRole', 'fetchCurrentActor', 'data-role-auth="checking"', 'data-role-auth="blocked"']) {
    if (!roleGateText.includes(snippet)) fail('role-gate.tsx must remain server-session presentation defense through ' + snippet);
  }
  for (const forbidden of ['readDemoIdentity', 'writeDemoIdentity', 'localStorage', 'sessionStorage', '/?role=']) {
    if (roleGateText.includes(forbidden)) fail('role-gate.tsx must not authorize from ' + forbidden);
  }

  const loginText = readFileSync(loginPage, 'utf8');
  for (const snippet of ["fetch('/api/auth/login'", "credentials: 'same-origin'", 'username: username.trim()', 'password', 'data-login-role']) {
    if (!loginText.includes(snippet)) fail('login-page.tsx must use the server login route through ' + snippet);
  }
  for (const forbidden of ['writeDemoIdentity', 'localStorage', 'sessionStorage', '/?role=', 'role: selectedRole']) {
    if (loginText.includes(forbidden)) fail('login-page.tsx must not submit browser-owned role authority through ' + forbidden);
  }

  const serverActorText = readFileSync(serverActor, 'utf8');
  for (const snippet of ['readActorFromRequest', 'readServerActor', 'requireUser', 'requireClassRole', 'readSessionCookie']) {
    if (!serverActorText.includes(snippet)) fail('server-actor.ts must expose the authoritative cookie boundary through ' + snippet);
  }

  const protectedPages = [
    [join(appRoot, 'course', 'page.tsx'), 'await requireUser()', ['getCapabilityGraph()']],
    [join(appRoot, 'learn', '[nodeId]', 'page.tsx'), "await requireClassRole('student')", ['createLearningCommandService()', 'learning.requireNodeAccess(actor, params.nodeId)', 'getCapabilityGraph(params.nodeId)']],
    [join(appRoot, 'teacher', 'sessions', '[sessionId]', 'page.tsx'), "await requireClassRole('teacher')", ['getTeacherSession(params.sessionId)']],
    [join(appRoot, 'classroom', '[sessionId]', 'page.tsx'), "await requireClassRole('student')", ['loadStudentFollowPage(getDatabase(), actor, params.sessionId)']],
    [join(appRoot, 'present', '[sessionId]', 'page.tsx'), "await requireClassRole('teacher')", ['getProjectorState(params.sessionId)']],
  ];
  for (const [file, guard, protectedCalls] of protectedPages) {
    if (!exists(file)) {
      fail(slash(relative(root, file)) + ' is required for protected server authorization');
      continue;
    }
    const text = readFileSync(file, 'utf8');
    const guardIndex = text.indexOf(guard);
    if (guardIndex < 0) {
      fail(slash(relative(root, file)) + ' must call ' + guard);
      continue;
    }
    for (const call of protectedCalls) {
      const callIndex = text.indexOf(call);
      if (callIndex < 0 || callIndex < guardIndex) {
        fail(slash(relative(root, file)) + ' must authorize before ' + call);
      }
    }
  }

  const rootPageText = readFileSync(rootPage, 'utf8');
  for (const snippet of ['readServerActor()', 'rootDestinationForActor(actor)', 'redirect(destination)']) {
    if (!rootPageText.includes(snippet)) fail('root gateway must route the server actor through ' + snippet);
  }

  for (const [files, role] of [
    [[join(classroomRoot, 'teacher-console-client.tsx'), join(classroomRoot, 'teacher-console-view.tsx')], 'teacher'],
    [[join(classroomRoot, 'projector-client.tsx')], 'teacher'],
  ]) {
    const text = files.filter(exists).map((file) => readFileSync(file, 'utf8')).join('\n');
    if (!text.includes('RoleGate') || !text.includes('requiredRole="' + role + '"')) {
      fail(slash(relative(root, files[0])) + ' must keep the optional client ' + role + ' defense');
    }
  }
}

function checkHomeRoleGatewayContract() {
  if (isDigitalTextbookV3()) {
    const files = {
      login: join(appRoot, 'page.tsx'),
      course: join(appRoot, 'course', 'page.tsx'),
      overview: join(sourceRoot, 'features', 'textbook-scene', 'course-overview.tsx'),
      scene: join(sourceRoot, 'features', 'textbook-scene', 'textbook-scene-shell.tsx'),
      sceneClient: join(sourceRoot, 'features', 'textbook-scene', 'textbook-scene-client.ts'),
      learnPage: join(appRoot, 'learn', '[nodeId]', 'page.tsx'),
      game: join(sourceRoot, 'features', 'learning', 'edugame-practice-panel.tsx'),
      store: join(platformRoot, 'skill-progress-store.ts'),
      client: join(sourceRoot, 'features', 'skill-tree', 'skill-progress-client.ts'),
      route: join(appRoot, 'api', 'skill-progress', '[studentId]', 'route.ts'),
    };
    for (const file of Object.values(files)) if (!exists(file)) fail(`${slash(relative(root, file))} is required for v3 textbook gateway`);
    if (!Object.values(files).every(exists)) return;
    for (const [file, snippets] of [
      [files.login, ['LoginPage', 'data-login-role="gateway"']],
      [files.course, ['AuthenticatedGate', 'CourseOverview', 'getCapabilityGraph']],
      [files.overview, ['CourseGraphStage', '/api/snapshot?audience=graph', 'projectGraphSnapshot', 'data-graph-progress', 'data-snapshot-version']],
      [files.scene, ['WebPlaybackDock', 'playbackScenes', 'data-narration-track', "setMode('challenge')", 'fetchStudentLearningCut']],
      [files.sceneClient, ["fetchAuthoritativeSnapshot('student', sessionId)", 'projectStudentLearningSnapshot(studentCut.me.learning)']],
      [files.learnPage, ['AuthoritativeSnapshotReader', "read(actor, 'student')", 'projectStudentLearningSnapshot(studentCut.me.learning)', 'initialSnapshot={initialSnapshot}', 'sessionId={studentCut.classroom.sessionId}']],
      [files.game, ['studentVersion: number', 'data-formal-test="retired"', '/test']],
      [files.store, ['LearningRepository', 'LearningReadModel', 'projectStudentLearningSnapshot']],
      [files.client, ['/api/learning/me', '/api/learning/class/', '/api/learning/nodes/']],
      [files.route, ['export async function GET', 'export async function POST', 'status: 410']],
    ]) {
      const text = readFileSync(file, 'utf8');
      for (const snippet of snippets) if (!text.includes(snippet)) fail(`${slash(relative(root, file))} must include ${snippet}`);
    }
    const storeText = readFileSync(files.store, 'utf8');
    for (const forbidden of ['globalThis', '__dgbookSkillEvents', 'appendSkillLearningEvent', 'resetSkillProgressForStudent']) {
      if (storeText.includes(forbidden)) fail(`skill-progress-store.ts must remain a stateless SQLite projection without ${forbidden}`);
    }
    const clientText = readFileSync(files.client, 'utf8');
    for (const forbidden of ['/api/skill-progress', 'evidence_submitted']) {
      if (clientText.includes(forbidden)) fail(`skill-progress-client.ts must not call legacy learning authority through ${forbidden}`);
    }
    if (readFileSync(files.overview, 'utf8').includes('fetchLearningProgress')) {
      fail('course-overview.tsx must consume the graph audience snapshot instead of the legacy learning endpoint');
    }
    for (const file of [files.scene, files.game]) {
      if (readFileSync(file, 'utf8').includes('fetchLearningProgress')) {
        fail(`${slash(relative(root, file))} must consume the student snapshot cut instead of /api/learning/me`);
      }
    }
    return;
  }
  const appHomeFile = join(appRoot, 'page.tsx');
  const courseOverviewFile = join(sourceRoot, 'features', 'textbook-scene', 'course-overview.tsx');
  const sceneShellFile = join(sourceRoot, 'features', 'textbook-scene', 'textbook-scene-shell.tsx');
  const samplePageFile = join(appRoot, 'samples', 'deep-textbook', 'P01-P02', 'page.tsx');
  const skillProgressStoreFile = join(platformRoot, 'skill-progress-store.ts');
  const skillProgressRouteFile = join(appRoot, 'api', 'skill-progress', '[studentId]', 'route.ts');
  const platformPageFile = join(appRoot, 'platform', 'page.tsx');
  const studentShellFile = join(sourceRoot, 'features', 'learning', 'student-shell.tsx');

  for (const file of [appHomeFile, courseOverviewFile, sceneShellFile, samplePageFile, skillProgressStoreFile, skillProgressRouteFile, platformPageFile]) {
    if (!exists(file)) fail(`${slash(relative(root, file))} is required for the capability-led textbook entry`);
  }
  if (!exists(courseOverviewFile) || !exists(sceneShellFile) || !exists(appHomeFile)) return;

  const appHomeText = readFileSync(appHomeFile, 'utf8');
  for (const snippet of ['CourseOverview', 'getCapabilityGraph']) {
    if (!appHomeText.includes(snippet)) fail(`app/page.tsx must render the full-screen course overview via ${snippet}`);
  }

  const overviewText = readFileSync(courseOverviewFile, 'utf8');
  for (const snippet of ['data-public-platform-home', 'CourseGraphStage', '/samples/deep-textbook/P01-P02', '/teacher/sessions/P1T1-N01', '/present/P1T1-N01']) {
    if (!overviewText.includes(snippet)) fail(`course-overview.tsx must expose the public textbook entry via ${snippet}`);
  }
  const sceneText = readFileSync(sceneShellFile, 'utf8');
  for (const snippet of ['TextbookSceneMode', 'FullscreenToggle', "setMode('task-map')", "setMode('challenge')", 'evidence_submitted', 'data-scene-mode']) {
    if (!sceneText.includes(snippet)) fail(`textbook-scene-shell.tsx must close the full-screen learning path via ${snippet}`);
  }

  if (exists(skillProgressStoreFile)) {
    const storeText = readFileSync(skillProgressStoreFile, 'utf8');
    for (const snippet of ['DEFAULT_REQUIRED_SECTIONS', 'classroomSubmitted', 'gameScore >= PASS_SCORE', "mastered ? 'mastered'"]) {
      if (!storeText.includes(snippet)) fail(`skill-progress-store.ts must enforce mastery through ${snippet}`);
    }
  }
  if (exists(skillProgressRouteFile)) {
    const routeText = readFileSync(skillProgressRouteFile, 'utf8');
    for (const snippet of ['export async function GET', 'export async function POST', 'appendSkillLearningEvent', 'isActiveDemoNode(body.nodeId)', 'validEventTypes']) {
      if (!routeText.includes(snippet)) fail(`skill progress API must expose ${snippet}`);
    }
  }

  if (exists(studentShellFile)) {
    const shellText = readFileSync(studentShellFile, 'utf8');
    for (const forbidden of ['href="/teacher"', 'href="/present/', 'href="/login/teacher"', "key: 'map'"]) {
      if (shellText.includes(forbidden)) fail(`student-shell.tsx must not expose platform/teacher route inside the student shell: ${forbidden}`);
    }
  }
}

function checkActivityQuestionContract() {
  if (isDigitalTextbookV3()) {
    const modelsFile = join(platformRoot, 'models.ts');
    const questionFile = join(sourceRoot, 'features', 'learning', 'activity-questions.ts');
    const followRendererFile = join(classroomRoot, 'classroom-follow-renderer.tsx');
    const practiceFile = join(sourceRoot, 'features', 'textbook-scene', 'micro-practice.tsx');
    const practiceModel = join(sourceRoot, 'features', 'textbook-scene', 'micro-practice-model.ts');
    for (const file of [modelsFile, questionFile, followRendererFile, practiceFile, practiceModel]) if (!exists(file)) fail(`${slash(relative(root, file))} is required for v3 learning activities`);
    if (![modelsFile, questionFile, followRendererFile, practiceFile, practiceModel].every(exists)) return;
    const questionText = readFileSync(questionFile, 'utf8');
    for (const snippet of ["type: 'single-choice'", "type: 'true-false'", 'gradeActivityAnswers']) if (!questionText.includes(snippet)) fail(`activity-questions.ts must include ${snippet}`);
    const followRendererText = readFileSync(followRendererFile, 'utf8');
    for (const snippet of ['data-teacher-task', 'data-classroom-activity', 'data-return-self-study']) if (!followRendererText.includes(snippet)) fail(`classroom-follow-renderer.tsx must keep classroom activity distinct from full self-study through ${snippet}`);
    const practiceText = readFileSync(practiceFile, 'utf8');
    for (const snippet of ['ConnectionPractice', 'OrderingPractice', 'EvidenceCards', 'ChoicePractice']) if (!practiceText.includes(snippet)) fail(`micro-practice.tsx must include ${snippet}`);
    const modelText = readFileSync(practiceModel, 'utf8');
    for (const kind of ['selection', 'connection', 'ordering', 'card-flip']) if (!modelText.includes(`'${kind}'`)) fail(`micro-practice-model.ts must include ${kind}`);
    return;
  }
  const modelsFile = join(platformRoot, 'models.ts');
  const questionModule = join(sourceRoot, 'features', 'learning', 'activity-questions.ts');
  const selfPanel = join(sourceRoot, 'features', 'learning', 'self-study-task-panel.tsx');
  const followPanel = join(classroomRoot, 'student-follow-client.tsx');

  if (!exists(modelsFile)) {
    fail('models.ts must define ActivityQuestion for scoreable choice and true-false tasks');
  } else {
    const modelsText = readFileSync(modelsFile, 'utf8');
    if (!modelsText.includes('ActivityQuestion')) {
      fail('models.ts must define ActivityQuestion for scoreable choice and true-false tasks');
    }
    if (modelsText.includes("'short-answer'") || modelsText.includes('"short-answer"')) {
      fail('models.ts must not expose short-answer as a scoreable activity question type');
    }
  }
  if (!exists(questionModule)) {
    fail('features/learning/activity-questions.ts is required');
    return;
  }

  const questionText = readFileSync(questionModule, 'utf8');
  for (const snippet of ["type: 'single-choice'", "type: 'true-false'", 'correctAnswer', 'gradeActivityAnswers']) {
    if (!questionText.includes(snippet)) fail(`activity-questions.ts must include ${snippet}`);
  }

  for (const file of [selfPanel, followPanel]) {
    if (!exists(file)) {
      fail(`${slash(relative(root, file))} is required`);
      continue;
    }
    const text = readFileSync(file, 'utf8');
    if (!text.includes('questionsForActivity')) fail(`${slash(relative(root, file))} must use questionsForActivity`);
    if (!text.includes('gradeActivityAnswers')) fail(`${slash(relative(root, file))} must use gradeActivityAnswers for local machine scoring`);
    if (!text.includes('data-choice-option')) fail(`${slash(relative(root, file))} must render scoreable choice buttons`);
    if (text.includes('<textarea') || text.includes('<input')) {
      fail(`${slash(relative(root, file))} must not use fill-in controls as the primary task answer UI`);
    }
  }
}

function checkP1LearningLoopContract() {
  if (isDigitalTextbookV3()) {
    const idsFile = join(platformRoot, 'fixtures', 'ids.ts');
    const textbookData = join(sourceRoot, 'features', 'platform', 'deep-textbook-demo-data.ts');
    const sceneFile = join(sourceRoot, 'features', 'textbook-scene', 'textbook-scene-shell.tsx');
    const learningFile = join(sourceRoot, 'features', 'textbook-scene', 'learning-scene.tsx');
    const challengeFile = join(sourceRoot, 'features', 'textbook-scene', 'challenge-scene.tsx');
    const followFile = join(classroomRoot, 'student-follow-client.tsx');
    const projectorFile = join(classroomRoot, 'projector-client.tsx');
    const practicePanelFile = join(sourceRoot, 'features', 'learning', 'edugame-practice-panel.tsx');
    const sceneCssFile = join(appRoot, 'textbook-scene.css');
    const classroomV4CssFile = join(appRoot, 'digital-classroom-v4.css');
    const gameFile = join(platformRoot, 'fixtures', 'skill-game-fixtures.ts');
    for (const file of [idsFile, textbookData, sceneFile, learningFile, challengeFile, followFile, projectorFile, practicePanelFile, sceneCssFile, classroomV4CssFile, gameFile]) if (!exists(file)) fail(`${slash(relative(root, file))} is required for the P01/P02/P03 loop`);
    if (![idsFile, textbookData, sceneFile, learningFile, challengeFile, followFile, projectorFile, practicePanelFile, sceneCssFile, classroomV4CssFile, gameFile].every(exists)) return;
    const idsText = readFileSync(idsFile, 'utf8');
    const dataText = readFileSync(textbookData, 'utf8');
    const generatedNodeIds = generatedP1NodeIds();
    for (const nodeId of [
      'P1T1-N01', 'P1T1-N02', 'P1T1-N03', 'P1T1-N04',
      'P1T2-N01', 'P1T2-N02', 'P1T2-N03', 'P1T2-N04',
      'P1T3-N01', 'P1T3-N02', 'P1T3-N03', 'P1T3-N04',
    ]) {
      if (!idsText.includes(`'${nodeId}'`) || !generatedNodeIds.includes(nodeId)) fail(`generated P1 textbook must define active node ${nodeId}`);
    }
    for (const snippet of ['createDemoTaskProfiles', 'SelfStudyCatalog', 'projectDemoUnit']) {
      if (!dataText.includes(snippet)) fail(`deep textbook adapter must project validated generated content through ${snippet}`);
    }
    for (const forbidden of ['进入机房前，怎样先确定本次采集边界', '照片怎样证明设备、槽位与端口属于同一条链', '怎样把用户口述转成可复现、可核对的投诉事实']) {
      if (dataText.includes(forbidden)) fail(`deep textbook adapter must not duplicate generated textbook body: ${forbidden}`);
    }
    const sceneText = readFileSync(sceneFile, 'utf8');
    for (const snippet of ['completeNode', 'professionalOutputSchemaForTask', 'outputSchema={outputSchema}', 'projectNodeAccess', 'continueAfterTest']) if (!sceneText.includes(snippet)) fail(`textbook-scene-shell.tsx must close the canonical loop via ${snippet}`);
    for (const forbidden of ['setEvidence', 'setOutputNotice', 'submitEvidence', 'evidence[selectedNodeId]']) if (sceneText.includes(forbidden)) fail(`textbook-scene-shell.tsx must not retain the retired free-text output path: ${forbidden}`);
    const challengeText = readFileSync(challengeFile, 'utf8');
    for (const snippet of ['ProfessionalOutputForm', 'policy?.requiresProfessionalOutput', 'outputSchema.taskId !== profile.taskId', 'data-task-challenge={`${profile.taskId}-output`}']) if (!challengeText.includes(snippet)) fail(`challenge-scene.tsx must expose generated N04 output semantics through ${snippet}`);
    for (const forbidden of ['<textarea', 'onEvidenceSubmit', 'evidenceReadOnly']) if (challengeText.includes(forbidden)) fail(`challenge-scene.tsx must not retain the retired free-text output path: ${forbidden}`);
    if (!challengeText.includes('projectChallengeScene(unit.capabilityNodeId, nodeProgress)')) fail('challenge-scene.tsx must delegate N02/N04 semantics to the canonical challenge projection');
    if (challengeText.includes("unit.capabilityNodeId === 'P1T1-N02' || isTaskFinal")) fail('challenge-scene.tsx must not invent professional output for N02');
    const followRendererFile = join(classroomRoot, 'classroom-follow-renderer.tsx');
    const followModelFile = join(classroomRoot, 'classroom-follow-model.ts');
    const followLoaderFile = join(classroomRoot, 'student-follow-loader.ts');
    for (const file of [followRendererFile, followModelFile, followLoaderFile]) if (!exists(file)) fail(`${slash(relative(root, file))} is required for generated classroom follow content`);
    if ([followRendererFile, followModelFile, followLoaderFile].every(exists)) {
      const followText = [followFile, followRendererFile, followModelFile, followLoaderFile].map((file) => readFileSync(file, 'utf8')).join('\n');
      for (const snippet of ['createClassroomContentCatalog', 'loadSelfStudyCatalog', 'data-classroom-current-unit', 'data-teacher-task', 'data-classroom-activity', 'data-return-self-study']) {
        if (!followText.includes(snippet)) fail(`classroom follow must render generated P01/P02/P03 content through ${snippet}`);
      }
    }
    const projectorText = readFileSync(projectorFile, 'utf8');
    for (const snippet of ['followerFrame', 'data-projector-narration', 'data-playback-status']) {
      if (!projectorText.includes(snippet)) fail(`projector-client.tsx must expose authoritative narration through ${snippet}`);
    }
    const practicePanelText = readFileSync(practicePanelFile, 'utf8');
    for (const snippet of ['data-skill-game={nodeId}', 'data-formal-test="retired"', '`/learn/${nodeId}/test`']) {
      if (!practicePanelText.includes(snippet)) fail(`edugame-practice-panel.tsx must hand off formal grading through ${snippet}`);
    }
    for (const forbidden of ['recordSkillEvent', 'Math.min(3', 'attemptsExhausted', 'score: nextRecord.score']) {
      if (practicePanelText.includes(forbidden)) fail(`edugame-practice-panel.tsx must not retain client scoring or an attempt cap: ${forbidden}`);
    }
    const sceneCssText = readFileSync(sceneCssFile, 'utf8');
    if (sceneCssText.includes('.student-formal-test-launch')) fail('textbook-scene.css must remove obsolete link-away-only student-formal-test-launch selectors');
    if (sceneCssText.includes('.student-test-main a')) fail('textbook-scene.css must remove obsolete link-away-only student-test-main anchor selectors');
    const classroomV4CssText = readFileSync(classroomV4CssFile, 'utf8');
    for (const snippet of ['.scene-student-playback', '.classroom-playback-follower', '.classroom-follower-caption', '.classroom-follower-progress']) {
      if (!classroomV4CssText.includes(snippet)) fail(`digital-classroom-v4.css must style the silent student narration strip via ${snippet}`);
    }
    const gameText = readFileSync(gameFile, 'utf8');
    for (const variant of ['topology-repair', 'evidence-chain', 'beam-tuning', 'coverage-survey']) if (!gameText.includes(`professionalVariant: '${variant}'`)) fail(`skill-game-fixtures.ts must include ${variant}`);
    return;
  }
  const idsFile = join(platformRoot, 'fixtures', 'ids.ts');
  const learningFile = join(platformRoot, 'fixtures', 'learning-fixtures.ts');
  const sessionProfilesFile = join(platformRoot, 'fixtures', 'session-profiles.ts');
  const sessionFixturesFile = join(platformRoot, 'fixtures', 'session-fixtures.ts');
  const taskDetailFile = join(sourceRoot, 'features', 'learning', 'task-detail.tsx');
  const selfStudyFile = join(sourceRoot, 'features', 'learning', 'self-study-page.tsx');
  const progressiveStudyFile = join(sourceRoot, 'features', 'learning', 'progressive-self-study-client.tsx');
  const gamePanelFile = join(sourceRoot, 'features', 'learning', 'edugame-practice-panel.tsx');
  const gameFixtureFile = join(platformRoot, 'fixtures', 'skill-game-fixtures.ts');
  const coverageGameFile = join(root, 'packages', 'widgets', 'src', 'edugame-pixi', 'CoverageSurveyArcade.tsx');
  const expectedNodes = [
    'P1T1-N01', 'P1T1-N02', 'P1T1-N03', 'P1T1-N04',
    'P1T2-N01', 'P1T2-N02', 'P1T2-N03', 'P1T2-N04',
  ];

  for (const file of [idsFile, learningFile, sessionProfilesFile, sessionFixturesFile, taskDetailFile, selfStudyFile, progressiveStudyFile, gamePanelFile, gameFixtureFile, coverageGameFile]) {
    if (!exists(file)) fail(`${slash(relative(root, file))} is required for the P1 learning loop`);
  }
  if (!exists(idsFile) || !exists(learningFile) || !exists(sessionProfilesFile)) return;

  const idsText = readFileSync(idsFile, 'utf8');
  const learningText = readFileSync(learningFile, 'utf8');
  const profilesText = readFileSync(sessionProfilesFile, 'utf8');
  const sessionText = exists(sessionFixturesFile) ? readFileSync(sessionFixturesFile, 'utf8') : '';
  for (const nodeId of expectedNodes) {
    if (!idsText.includes(`'${nodeId}'`)) fail(`activeDemoNodeIds must include ${nodeId}`);
    if (!profilesText.includes(`'${nodeId}'`)) fail(`session-profiles.ts must define ${nodeId}`);
  }
  for (const nodeId of ['P1T3-N01', 'P1T3-N02', 'P1T3-N03', 'P1T3-N04']) {
    if (idsText.includes(`'${nodeId}'`)) fail(`activeDemoNodeIds must keep ${nodeId} as structure-only, not a writable learning route`);
  }
  for (const snippet of ['questionsForNode', 'Q-${node.nodeId}-01', 'Q-${node.nodeId}-02', 'Q-${node.nodeId}-03']) {
    if (!learningText.includes(snippet)) fail(`learning-fixtures.ts must generate node-specific scoreable questions via ${snippet}`);
  }
  for (const snippet of ['P01', 'P02', 'P03', '-stage-speech-004', '-stage-speech-010', 'collection-conclusion']) {
    if (!sessionText.includes(snippet)) fail(`session-fixtures.ts must support full P1 playback loop with ${snippet}`);
  }

  if (exists(taskDetailFile)) {
    const text = readFileSync(taskDetailFile, 'utf8');
    const taskLoopSnippets = [
      'data-p1-loop="task"',
      '完整学习闭环',
      'href={`/learn/${node.nodeId}`}',
      'href={`/classroom/${node.nodeId}`}',
    ];
    for (const snippet of taskLoopSnippets) {
      if (!text.includes(snippet)) fail(`task-detail.tsx must expose P1 node loop via ${snippet}`);
    }
    if (text.includes('href={`/teacher/') || text.includes('href={`/present/')) {
      fail('student task detail must not expose teacher or projector role links');
    }
  }
  if (exists(selfStudyFile)) {
    const text = readFileSync(selfStudyFile, 'utf8');
    for (const snippet of ['ProgressiveSelfStudyClient', 'WebPlaybackDock', 'StudentShell']) {
      if (!text.includes(snippet)) fail(`self-study-page.tsx must compose the progressive textbook via ${snippet}`);
    }
  }
  if (exists(progressiveStudyFile)) {
    const text = readFileSync(progressiveStudyFile, 'utf8');
    for (const snippet of ['data-progressive-study', 'knowledge-disclosure', 'classroomSubmitted', "type: 'section_completed'", 'EduGamePracticePanel', 'data-skill-mastered']) {
      if (!text.includes(snippet)) fail(`progressive-self-study-client.tsx must close learning evidence via ${snippet}`);
    }
  }
  if (exists(gamePanelFile)) {
    const text = readFileSync(gamePanelFile, 'utf8');
    for (const snippet of ['data-formal-test="retired"', '`/learn/${nodeId}/test`']) {
      if (!text.includes(snippet)) fail(`edugame-practice-panel.tsx must hand off formal grading via ${snippet}`);
    }
  }
  if (exists(gameFixtureFile)) {
    const text = readFileSync(gameFixtureFile, 'utf8');
    for (const snippet of ["'pipe-connect'", "'P1T1-N01-boundary'", "'P1T1-N01-evidence'", 'definition: pointNames.get', "arenaVariant: 'coverage-survey'", "'P1T2-N04'"]) {
      if (!text.includes(snippet)) fail(`skill-game-fixtures.ts must bind professional game semantics via ${snippet}`);
    }
  }
  if (exists(coverageGameFile)) {
    const text = readFileSync(coverageGameFile, 'utf8');
    for (const snippet of ["import('pixi.js')", 'app?.destroy', 'prefers-reduced-motion', 'data-edugame-target-id', 'onDrop']) {
      if (!text.includes(snippet)) fail(`CoverageSurveyArcade.tsx must provide a lifecycle-safe accessible Pixi challenge via ${snippet}`);
    }
  }

  const teacherConsoleFile = join(classroomRoot, 'teacher-console-client.tsx');
  if (exists(teacherConsoleFile)) {
    const text = readFileSync(teacherConsoleFile, 'utf8');
    for (const snippet of ['TeacherSkillPulse', 'nodeId={unit.capabilityNodeId}', 'SharedClassroomScene', 'requestTeacherReview']) {
      if (!text.includes(snippet)) fail(`teacher-console-client.tsx must expose learner skill evidence via ${snippet}`);
    }
  }

  const followFile = join(classroomRoot, 'student-follow-client.tsx');
  const handoffFile = join(classroomRoot, 'classroom-skill-handoff.tsx');
  if (exists(followFile) && !readFileSync(followFile, 'utf8').includes("type: 'classroom_submitted'")) {
    fail('student-follow-client.tsx must write classroom_submitted into skill progress');
  }
  if (exists(handoffFile) && !readFileSync(handoffFile, 'utf8').includes('data-follow-skill-handoff')) {
    fail('classroom-skill-handoff.tsx must return submitted learners to the professional challenge');
  }
}

function checkDemoSeedContract() {
  const seedFile = join(root, 'apps', 'web', 'database', 'demo-seed.json');
  if (!exists(seedFile)) {
    fail('apps/web/database/demo-seed.json is required for the three-student demo');
    return;
  }

  let seed;
  try {
    seed = JSON.parse(readFileSync(seedFile, 'utf8'));
  } catch (error) {
    fail(`apps/web/database/demo-seed.json must be valid JSON: ${error instanceof Error ? error.message : String(error)}`);
    return;
  }

  const demo = seed?.demo;
  const cursors = Array.isArray(demo?.cursors) ? demo.cursors : [];
  if (cursors.some((cursor) => Object.prototype.hasOwnProperty.call(cursor ?? {}, 'contextId'))) {
    fail('demo self-study cursors must not retain the superseded contextId identity');
  }
  const cursorProjection = cursors
    .map(({ studentId, nodeId, unitId }) => ({ studentId, nodeId, unitId }))
    .sort((left, right) => String(left.studentId).localeCompare(String(right.studentId)));
  const expectedCursors = [
    { studentId: 'stu-01', nodeId: 'P1T1-N01', unitId: 'P01-ku-01' },
    { studentId: 'stu-02', nodeId: 'P1T1-N04', unitId: 'P01-ku-04' },
    { studentId: 'stu-03', nodeId: 'P1T3-N04', unitId: 'P03-ku-04' },
  ];
  if (JSON.stringify(cursorProjection) !== JSON.stringify(expectedCursors)) {
    fail('demo cursors must expose the clean, returned-revision, and completed-project personas');
  }

  const events = Array.isArray(demo?.events) ? demo.events : [];
  const practiceAttempts = Array.isArray(demo?.practiceAttempts) ? demo.practiceAttempts : [];
  const attempts = Array.isArray(demo?.attempts) ? demo.attempts : [];
  const outputs = Array.isArray(demo?.outputs) ? demo.outputs : [];
  const reviews = Array.isArray(demo?.reviews) ? demo.reviews : [];
  const frozenScores = Array.isArray(demo?.frozenTaskScores) ? demo.frozenTaskScores : [];
  const requiredP01Activities = [
    'P1T1-N01-micro-01',
    'P1T1-N02-foundation-01',
    'P1T1-N02-application-01',
    'P1T1-N02-transfer-01',
    'P1T1-N03-micro-01',
    'P1T1-N04-micro-01',
  ];
  for (const studentId of ['stu-02', 'stu-03']) {
    const activities = practiceAttempts
      .filter((attempt) => attempt?.studentId === studentId && String(attempt?.nodeId).startsWith('P1T1-'))
      .map((attempt) => attempt.activityId)
      .sort();
    if (JSON.stringify(activities) !== JSON.stringify([...requiredP01Activities].sort())) {
      fail(`${studentId} must seed exactly the six required P01 practice attempts`);
    }
  }
  if (practiceAttempts.some((attempt) => attempt?.studentId === 'stu-01')) {
    fail('stu-01 must remain a clean learner without practice attempts');
  }

  const formalProjection = attempts.map(({ studentId, nodeId, score }) => ({ studentId, nodeId, score }));
  const expectedFormalProjection = [
    { studentId: 'stu-02', nodeId: 'P1T1-N02', score: 88 },
    { studentId: 'stu-03', nodeId: 'P1T1-N02', score: 93 },
    { studentId: 'stu-03', nodeId: 'P1T2-N02', score: 91 },
    { studentId: 'stu-03', nodeId: 'P1T3-N02', score: 90 },
  ];
  if (JSON.stringify(formalProjection) !== JSON.stringify(expectedFormalProjection)) {
    fail('demo formal attempts must model one returned P01 learner and one complete P1 learner');
  }
  if (attempts.some((attempt) => !attempt?.assessmentId || !attempt?.completedAt)) {
    fail('every demo formal attempt must be bound to an assessment and explicit completion time');
  }

  if (attempts.some((attempt) => String(attempt?.nodeId).endsWith('-N04') || attempt?.gameId === 'task-pixi')) {
    fail('demo seed must never create an N04 or task-pixi formal attempt');
  }

  const outputProjection = outputs.map(({ studentId, taskId, status, currentVersion }) => ({
    studentId, taskId, status, currentVersion,
  }));
  const expectedOutputProjection = [
    { studentId: 'stu-02', taskId: 'P01', status: 'returned', currentVersion: 1 },
    { studentId: 'stu-03', taskId: 'P01', status: 'verified', currentVersion: 2 },
    { studentId: 'stu-03', taskId: 'P02', status: 'verified', currentVersion: 1 },
    { studentId: 'stu-03', taskId: 'P03', status: 'verified', currentVersion: 1 },
  ];
  if (JSON.stringify(outputProjection) !== JSON.stringify(expectedOutputProjection)) {
    fail('demo outputs must model P01 V1 returned and a verified P01 V2 to P03 chain');
  }
  const reviewProjection = reviews.map(({ outputId, outputVersion, status }) => ({
    outputId, outputVersion, status,
  }));
  const expectedReviewProjection = [
    { outputId: 'demo-output-stu-02-p01', outputVersion: 1, status: 'returned' },
    { outputId: 'demo-output-stu-03-p01', outputVersion: 1, status: 'returned' },
    { outputId: 'demo-output-stu-03-p01', outputVersion: 2, status: 'verified' },
    { outputId: 'demo-output-stu-03-p02', outputVersion: 1, status: 'verified' },
    { outputId: 'demo-output-stu-03-p03', outputVersion: 1, status: 'verified' },
  ];
  if (JSON.stringify(reviewProjection) !== JSON.stringify(expectedReviewProjection)) {
    fail('demo reviews must stay bound to the exact output version they reviewed');
  }
  if (events.some((event) => event?.studentId === 'stu-01')) {
    fail('stu-01 must remain a clean learner without learning events');
  }

  const frozenProjection = frozenScores
    .map(({ scoreId, studentId, taskId, snapshotVersion, officialScore }) => ({
      scoreId, studentId, taskId, snapshotVersion, officialScore,
    }))
    .sort((left, right) => `${left.studentId}/${left.taskId}`.localeCompare(`${right.studentId}/${right.taskId}`));
  const expectedFrozenScores = [
    {
      scoreId: 'demo-score-stu-03-p01',
      studentId: 'stu-03',
      taskId: 'P01',
      snapshotVersion: 4,
      officialScore: 94,
    },
    {
      scoreId: 'demo-score-stu-03-p02',
      studentId: 'stu-03',
      taskId: 'P02',
      snapshotVersion: 5,
      officialScore: 92,
    },
    {
      scoreId: 'demo-score-stu-03-p03',
      studentId: 'stu-03',
      taskId: 'P03',
      snapshotVersion: 6,
      officialScore: 91,
    },
  ];
  if (JSON.stringify(frozenProjection) !== JSON.stringify(expectedFrozenScores)) {
    fail('only the complete stu-03 persona may have canonical P01/P02/P03 frozen scores');
  }
}

function checkCanonicalLearningPolicyContract() {
  const policyFile = join(platformRoot, 'learning-policy.ts');
  const accessFile = join(platformRoot, 'access-control.ts');
  const accessProjectionFile = join(platformRoot, 'node-access-projection.ts');
  const idsFile = join(platformRoot, 'fixtures', 'ids.ts');
  const textbookDataFile = join(sourceRoot, 'features', 'platform', 'deep-textbook-demo-data.ts');
  const challengeModelFile = join(sourceRoot, 'features', 'textbook-scene', 'challenge-scene-model.ts');
  const mockApiFile = join(platformRoot, 'mock-api.ts');
  const progressStoreFile = join(platformRoot, 'skill-progress-store.ts');
  const progressRouteFile = join(appRoot, 'api', 'skill-progress', '[studentId]', 'route.ts');
  const sceneFile = join(sourceRoot, 'features', 'textbook-scene', 'textbook-scene-shell.tsx');
  const mobileGraphFile = join(sourceRoot, 'features', 'textbook-scene', 'course-graph-stage.tsx');
  const desktopGraphFile = join(sourceRoot, 'features', 'capability-map', 'semantic-graph-elements.tsx');
  const files = [
    policyFile,
    accessFile,
    accessProjectionFile,
    idsFile,
    textbookDataFile,
    challengeModelFile,
    mockApiFile,
    progressStoreFile,
    progressRouteFile,
    sceneFile,
    mobileGraphFile,
    desktopGraphFile,
  ];
  for (const file of files) {
    if (!exists(file)) fail(slash(relative(root, file)) + ' is required for canonical P1 policy and access');
  }
  if (!files.every(exists)) return;

  const policyText = readFileSync(policyFile, 'utf8');
  for (const snippet of [
    "export type P1TaskId = 'P01' | 'P02' | 'P03'",
    "taskId: 'P01'",
    "taskId: 'P02'",
    "taskId: 'P03'",
    'Array.from({ length: 4 }',
    'const isNodeTest = index === 2',
    'const isTaskEnd = index === 4',
    'requiresFormalTest: isNodeTest',
    "assessmentRole: isNodeTest ? 'node-test' : 'none'",
    'formalPassScore: isNodeTest ? 80 : undefined',
    'requiresProfessionalOutput: isTaskEnd',
    'requiresTeacherVerification: isTaskEnd',
    "publicationStatus: 'published'",
  ]) {
    if (!policyText.includes(snippet)) fail('learning-policy.ts must define N02 node-test and N04 output semantics through ' + snippet);
  }

  const idsText = readFileSync(idsFile, 'utf8');
  const textbookDataText = readFileSync(textbookDataFile, 'utf8');
  const generatedNodeIds = generatedP1NodeIds();
  for (const nodeId of [
    'P1T1-N01', 'P1T1-N02', 'P1T1-N03', 'P1T1-N04',
    'P1T2-N01', 'P1T2-N02', 'P1T2-N03', 'P1T2-N04',
    'P1T3-N01', 'P1T3-N02', 'P1T3-N03', 'P1T3-N04',
  ]) {
    if (!idsText.includes("'" + nodeId + "'")) fail('activeDemoNodeIds must include ' + nodeId);
    if (!generatedNodeIds.includes(nodeId)) fail('generated P1 textbook must define ' + nodeId);
  }
  for (const snippet of ['createDemoTaskProfiles', 'getDemoTaskProfileForNode', 'SelfStudyCatalog']) {
    if (!textbookDataText.includes(snippet)) fail('deep textbook adapter must consume the validated catalog through ' + snippet);
  }

  const accessText = readFileSync(accessFile, 'utf8');
  for (const snippet of [
    'classifyNodeRouteFromPolicy',
    "policy.publicationStatus !== 'published'",
    "classification.kind !== 'open'",
    'throw new NodeRouteAccessError(classification)',
  ]) {
    if (!accessText.includes(snippet)) fail('access-control.ts must fail unknown/not-open nodes closed through ' + snippet);
  }

  const mockApiText = readFileSync(mockApiFile, 'utf8');
  for (const snippet of [
    'const effectiveNodeId = resolveNodeId(nodeId)',
    'const effectiveFocusNodeId = resolveNodeId(focusNodeId)',
  ]) {
    if (!mockApiText.includes(snippet)) fail('real content loaders must use the strict node resolver through ' + snippet);
  }

  const projectionText = readFileSync(accessProjectionFile, 'utf8');
  for (const snippet of [
    'export interface NodeAccessProjection',
    'export function projectNodeAccess',
    'export function projectTaskAccess',
    "P01: 'P1T1-N01'",
    "P02: 'P1T2-N01'",
    "P03: 'P1T3-N01'",
    'disabled: true',
  ]) {
    if (!projectionText.includes(snippet)) fail('NodeAccessProjection must be the canonical UI access DTO through ' + snippet);
  }

  const challengeModelText = readFileSync(challengeModelFile, 'utf8');
  for (const snippet of [
    'getNodeLearningPolicy(nodeId)',
    '!policy.requiresFormalTest',
    'requiresProfessionalOutput: policy.requiresProfessionalOutput',
    'requiresTeacherVerification: policy.requiresTeacherVerification',
  ]) {
    if (!challengeModelText.includes(snippet)) fail('challenge projection must consume canonical N02/N04 policy through ' + snippet);
  }

  const progressRouteText = readFileSync(progressRouteFile, 'utf8');
  if (!progressRouteText.includes('status: 410')) {
    fail('legacy skill progress route must fail closed with HTTP 410');
  }

  const progressStoreText = readFileSync(progressStoreFile, 'utf8');
  for (const snippet of ['LearningRepository', 'LearningReadModel', 'projectStudentLearningSnapshot']) {
    if (!progressStoreText.includes(snippet)) fail('legacy progress reads must derive from canonical SQLite facts through ' + snippet);
  }
  for (const forbidden of ['globalThis', '__dgbookSkillEvents', 'appendSkillLearningEvent', 'resetSkillProgressForStudent']) {
    if (progressStoreText.includes(forbidden)) fail('legacy progress projection must not own mutable state through ' + forbidden);
  }

  const consumerContracts = [
    [sceneFile, ['projectNodeAccess', 'projectTaskAccess']],
    [mobileGraphFile, ['projectNodeAccess', 'projectTaskAccess', 'access.disabled']],
    [desktopGraphFile, ['projectNodeAccess', 'projectTaskAccess', 'NodeAccessProjection', 'access.disabled']],
  ];
  for (const [file, snippets] of consumerContracts) {
    const text = readFileSync(file, 'utf8');
    for (const snippet of snippets) {
      if (!text.includes(snippet)) fail(slash(relative(root, file)) + ' must consume NodeAccessProjection through ' + snippet);
    }
  }

  const forbiddenSources = [
    [accessFile, accessText],
    [mockApiFile, mockApiText],
    [progressStoreFile, progressStoreText],
    [sceneFile, readFileSync(sceneFile, 'utf8')],
    [mobileGraphFile, readFileSync(mobileGraphFile, 'utf8')],
    [desktopGraphFile, readFileSync(desktopGraphFile, 'utf8')],
  ];
  const forbiddenPatterns = [
    ['formalTestNodeIds', /formalTestNodeIds/],
    ['N04 suffix inference', /endsWith\([^)]*N04/],
    ['task-index identity', /TASK_IDS\s*\[\s*taskIndex/],
    ['P01 fallback', /\?\?\s*['"]P01['"]/],
    ['active-node fallback', /activeDemoNodeIds\.includes\(nodeId\)\s*\?\s*nodeId/],
    ['first node or task fallback', /(?:nodes|tasks)\s*\[\s*0\s*\]/],
    ['fixture node.locked authority', /node\.locked/],
    ['prefix-derived task authority', /startsWith\(\s*prefix/],
    ['first-index availability', /index\s*===\s*0[^\n]{0,80}available/],
  ];
  for (const [file, text] of forbiddenSources) {
    for (const [label, pattern] of forbiddenPatterns) {
      if (label === 'P01 fallback' && ![accessFile, mockApiFile, progressStoreFile].includes(file)) continue;
      if (pattern.test(text)) fail(slash(relative(root, file)) + ' must not use ' + label);
    }
  }
}

function checkClassroomRosterSourceContract() {
  const repositoryFile = join(platformRoot, 'classroom-roster-repository.ts');
  const storeFile = join(platformRoot, 'class-session-store.ts');
  const fixtureFile = join(platformRoot, 'fixtures', 'session-fixtures.ts');
  const teacherViewFile = join(classroomRoot, 'teacher-console-view.tsx');
  const teacherInspectorFile = join(classroomRoot, 'teacher-console-inspector.tsx');
  const files = [repositoryFile, storeFile, fixtureFile, teacherViewFile, teacherInspectorFile];
  for (const file of files) {
    if (!exists(file)) fail(slash(relative(root, file)) + ' is required for the SQLite-backed classroom roster');
  }
  if (!files.every(exists)) return;

  const repositoryText = readFileSync(repositoryFile, 'utf8');
  for (const snippet of [
    'FROM classroom_sessions AS classroom',
    'JOIN classroom_members AS member',
    'JOIN users AS user',
    'WHERE classroom.session_id = ?',
    'ORDER BY member.joined_at, member.student_id',
  ]) {
    if (!repositoryText.includes(snippet)) fail('classroom roster must come from dynamic SQLite membership through ' + snippet);
  }

  const storeText = readFileSync(storeFile, 'utf8');
  for (const snippet of [
    'new ClassroomSessionRepository(database)',
    'new ClassroomRosterRepository(database)',
    'service.materialize(stored)',
  ]) {
    if (!storeText.includes(snippet)) fail('class-session-store.ts must delegate to the SQLite classroom service through ' + snippet);
  }
  for (const forbidden of ['__dgbookClassSessions', '__dgbookClassSessionDevices']) {
    if (storeText.includes(forbidden)) fail('class-session-store.ts must not retain process-local runtime state through ' + forbidden);
  }

  const fixtureText = readFileSync(fixtureFile, 'utf8');
  for (const snippet of ['suppliedRoster: readonly StudentProgress[]']) {
    if (!fixtureText.includes(snippet)) fail('session fixtures must project the supplied membership roster through ' + snippet);
  }

  const teacherViewText = readFileSync(teacherViewFile, 'utf8');
  const teacherInspectorText = readFileSync(teacherInspectorFile, 'utf8');
  if (!teacherInspectorText.includes('{p.formalAssessment.submittedCount}/{p.formalAssessment.eligibleCount}')) {
    fail('teacher formal-test totals must come from the authoritative snapshot');
  }

  const productionRosterText = [repositoryText, storeText, fixtureText, teacherViewText, teacherInspectorText].join('\n');
  for (const forbidden of ['createDeterministicRoster(', 'index < 18', 'index < 22', '18/24', '21/24']) {
    if (productionRosterText.includes(forbidden)) {
      fail('production classroom roster must not hard-code the old fixture fact ' + forbidden);
    }
  }
}

function checkGraphicSystemContract() {
  if (isDigitalTextbookV3()) {
    const required = [
      join(sourceRoot, 'ui', 'foundation', 'icons.tsx'), join(appRoot, 'graphic-system.css'),
      join(sourceRoot, 'features', 'capability-map', 'semantic-course-graph.tsx'),
      join(sourceRoot, 'features', 'capability-map', 'semantic-graph-elements.tsx'),
      join(sourceRoot, 'features', 'textbook-scene', 'learning-scene.tsx'),
      join(root, 'packages', 'widgets', 'src', 'edugame-pixi', 'TopologyRepairArcade.tsx'),
      join(root, 'packages', 'widgets', 'src', 'edugame-pixi', 'EvidenceChainArcade.tsx'),
      join(root, 'packages', 'widgets', 'src', 'edugame-pixi', 'BeamTuningArcade.tsx'),
      join(root, 'packages', 'widgets', 'src', 'edugame-pixi', 'CoverageSurveyArcade.tsx'),
    ];
    for (const file of required) if (!exists(file)) fail(`${slash(relative(root, file))} is required for v3 graphic system`);
    if (!required.every(exists)) return;
    const graphText = readFileSync(required[2], 'utf8');
    for (const snippet of ['data-semantic-course-graph', 'GraphMinimap', "from 'd3-zoom'", 'semantic-graph-elements']) if (!graphText.includes(snippet)) fail(`semantic-course-graph.tsx must include ${snippet}`);
    const graphElementsText = readFileSync(required[3], 'utf8');
    for (const snippet of ['edgeBoundaryPoints', 'GraphEdge', 'GraphNode']) if (!graphElementsText.includes(snippet)) fail(`semantic-graph-elements.tsx must include ${snippet}`);
    const learningText = readFileSync(required[4], 'utf8');
    for (const snippet of ['data-graphic-system="engineering-line"', 'SceneVisual', 'learning-stage-panel']) if (!learningText.includes(snippet)) fail(`learning-scene.tsx must include ${snippet}`);
    for (const file of required.slice(5)) {
      const text = readFileSync(file, 'utf8');
      for (const snippet of ["import('pixi.js')", 'app?.destroy', 'prefers-reduced-motion']) if (!text.includes(snippet)) fail(`${slash(relative(root, file))} must include ${snippet}`);
    }
    return;
  }
  const iconFile = join(sourceRoot, 'ui', 'foundation', 'icons.tsx');
  const graphicSystemFile = join(sourceRoot, 'ui', 'foundation', 'graphic-system.tsx');
  const graphicCssFile = join(appRoot, 'graphic-system.css');
  const layoutFile = join(appRoot, 'layout.tsx');
  const visualFiles = [
    join(sourceRoot, 'ui', 'foundation', 'mobility-visual.tsx'),
    join(sourceRoot, 'ui', 'foundation', 'classroom-visuals.tsx'),
    join(sourceRoot, 'features', 'capability-map', 'capability-path-canvas.tsx'),
    join(sourceRoot, 'features', 'capability-map', 'capability-node-card.tsx'),
    join(sourceRoot, 'features', 'capability-map', 'capability-map-panel.tsx'),
  ];

  for (const file of [iconFile, graphicSystemFile, graphicCssFile]) {
    if (!exists(file)) fail(`${slash(relative(root, file))} is required for the engineering-line graphic system`);
  }
  if (!exists(iconFile) || !exists(graphicSystemFile) || !exists(graphicCssFile) || !exists(layoutFile)) return;

  const iconText = readFileSync(iconFile, 'utf8');
  for (const snippet of ['GraphicIconName', 'stroke="currentColor"', "'site'", "'room'", "'aau'", "'bbu'", "'rru'", "'gps'", "'log'", "'complaint'", "'kpi'", "'signaling'", "'projector'", "'follow'"]) {
    if (!iconText.includes(snippet)) fail(`icons.tsx must include unified currentColor line icon support for ${snippet}`);
  }

  const graphicText = readFileSync(graphicSystemFile, 'utf8');
  for (const snippet of ['GraphicTheme', 'light-engineering', 'dark-engineering', 'SemanticEdgeLine', 'GraphicNode']) {
    if (!graphicText.includes(snippet)) fail(`graphic-system.tsx must define ${snippet}`);
  }

  const cssText = readFileSync(graphicCssFile, 'utf8');
  for (const snippet of ['--graphic-line', '--graphic-spotlight', '--graphic-laser', 'data-graphic-theme="dark-engineering"', '.web-focus-overlay.is-spotlight']) {
    if (!cssText.includes(snippet)) fail(`graphic-system.css must include ${snippet}`);
  }
  if (!readFileSync(layoutFile, 'utf8').includes("./graphic-system.css")) {
    fail('layout.tsx must import graphic-system.css after page-level CSS');
  }

  for (const file of visualFiles) {
    if (!exists(file)) {
      fail(`${slash(relative(root, file))} is required for P1 graphic style audit`);
      continue;
    }
    const rel = slash(relative(root, file));
    const text = readFileSync(file, 'utf8');
    if (!text.includes('data-graphic-system="engineering-line"')) {
      fail(`${rel} must expose data-graphic-system="engineering-line"`);
    }
    if (!text.includes('data-graphic-theme')) {
      fail(`${rel} must expose data-graphic-theme for light/dark audit`);
    }
    if (/#000(?:000)?\b/.test(text)) {
      fail(`${rel} must not hard-code black inside teaching graphics`);
    }
  }

  const capabilityEdge = join(sourceRoot, 'features', 'capability-map', 'capability-edge.tsx');
  const capabilityModel = join(sourceRoot, 'features', 'capability-map', 'capability-path-model.ts');
  for (const file of [capabilityEdge, capabilityModel]) {
    if (!exists(file)) continue;
    const text = readFileSync(file, 'utf8');
    for (const literal of ['#1457d9', '#0f9f8f', '#6758f4', '#d97706', '#dc3545']) {
      if (text.includes(literal)) fail(`${slash(relative(root, file))} must use graphic CSS tokens instead of ${literal}`);
    }
  }

  const classroomVisuals = join(sourceRoot, 'ui', 'foundation', 'classroom-visuals.tsx');
  if (exists(classroomVisuals)) {
    const text = readFileSync(classroomVisuals, 'utf8');
    for (const snippet of ['GraphicNode', 'SemanticEdgeLine', 'GraphicIconName']) {
      if (!text.includes(snippet)) fail('classroom-visuals.tsx must use shared graphic components and typed icon names');
    }
  }
  const lightClassroomFiles = [
    join(classroomRoot, 'teacher-console-client.tsx'),
    join(classroomRoot, 'projector-client.tsx'),
    join(classroomRoot, 'student-follow-client.tsx'),
  ];
  for (const file of lightClassroomFiles) {
    if (!exists(file)) continue;
    const rel = slash(relative(root, file));
    const text = readFileSync(file, 'utf8');
    if (!text.includes('data-ui-surface="light"')) {
      fail(`${rel} must expose data-ui-surface="light" on the default role surface`);
    }
  }
  for (const file of [join(classroomRoot, 'teacher-console-client.tsx'), join(classroomRoot, 'projector-client.tsx')]) {
    if (!exists(file)) continue;
    const rel = slash(relative(root, file));
    const text = readFileSync(file, 'utf8');
    if (text.includes('theme="dark-engineering"')) {
      fail(`${rel} must not render default classroom teaching graphics with dark-engineering`);
    }
    if (!text.includes('SharedClassroomScene') || !text.includes('data-ui-surface="light"')) {
      fail(`${rel} must render the shared light classroom scene`);
    }
  }
  const classroomCss = join(appRoot, 'classroom.css');
  if (exists(classroomCss)) {
    const text = readFileSync(classroomCss, 'utf8');
    if (/\.teacher-console,\s*\.projector-app\s*\{[^}]*background:\s*linear-gradient\(135deg,\s*#061433/im.test(text)) {
      fail('classroom.css must not keep teacher/projector as full-page dark shells');
    }
    if (/\.projector-stage\s*\{[^}]*background:\s*radial-gradient\([^}]*rgba\(6,19,45/im.test(text)) {
      fail('projector-stage must default to a light teaching surface');
    }
  }
}

function checkNextDefaultEntrypointContract() {
  const rootPackageFile = join(root, 'package.json');
  const readmeFile = join(root, 'README.md');
  if (!exists(rootPackageFile)) {
    fail('package.json is required to declare Next.js root commands');
    return;
  }

  const pkg = JSON.parse(readFileSync(rootPackageFile, 'utf8'));
  const scripts = pkg.scripts ?? {};
  const requiredScripts = {
    dev: 'pnpm web:dev',
    build: 'pnpm web:build',
    typecheck: 'pnpm web:typecheck',
    'web:dev': 'pnpm --filter @dgbook/web dev',
    'web:build': 'pnpm --filter @dgbook/web build',
    'web:typecheck': 'pnpm --filter @dgbook/web typecheck',
    'deploy:web:source:ready': 'node scripts/release-web-source.mjs',
  };
  for (const [name, expected] of Object.entries(requiredScripts)) {
    if (scripts[name] !== expected) fail(`package.json script ${name} must be ${expected}`);
  }
  if (!String(scripts['qa:gates'] ?? '').includes('qa:web')) {
    fail('qa:gates must target apps/web');
  }
  const expectedWorkspaces = ['apps/*', 'packages/*'];
  if (JSON.stringify(pkg.workspaces) !== JSON.stringify(expectedWorkspaces)) {
    fail('package.json workspaces must contain only apps/* and packages/*');
  }

  if (exists(readmeFile)) {
    const text = readFileSync(readmeFile, 'utf8');
    for (const required of ['apps/web', 'TypeScript + React + Next.js', 'pnpm deploy:web:source:ready']) {
      if (!text.includes(required)) fail(`README.md must document ${required}`);
    }
  }
}

function checkDgbookCliContract() {
  const cliFile = join(root, 'scripts', 'dgbook.mjs');
  if (!exists(cliFile)) {
    fail('scripts/dgbook.mjs is required');
    return;
  }
  const text = readFileSync(cliFile, 'utf8');
  if (!text.includes("command === 'publish-site'") || !text.includes("['--filter', '@dgbook/web', 'build']")) {
    fail('dgbook publish-site must build the Next.js @dgbook/web platform');
  }
  if (text.includes("command === 'publish-legacy-")) {
    fail('dgbook CLI must not expose a retired publishing branch');
  }
  if (!text.includes("'cmd.exe'") || !text.includes('function cmdArg') || text.includes('status ?? 0')) {
    fail('dgbook CLI must use a reliable pnpm command and must not hide spawn failures');
  }
  if (!text.includes('publish-site               构建 Next.js 主平台')) {
    fail('dgbook CLI help must describe publish-site as the Next.js platform build');
  }
  if (text.includes('publish-legacy-')) {
    fail('dgbook CLI help must not advertise a retired publishing command');
  }
  if (text.includes('publish-site               构建静态站点')) {
    fail('dgbook CLI help must not describe publish-site as the old static site build');
  }
}

function checkWebReleaseScriptContract() {
  const files = [
    join(root, 'scripts', 'release-web-source.mjs'),
    join(root, 'scripts', 'prepare-web-source-release.mjs'),
    join(root, 'scripts', 'web-source-deploy-plan.mjs'),
    join(root, 'scripts', 'deploy-web-source-ssh.mjs'),
    join(root, 'scripts', 'deploy-web-source-paramiko.py'),
    join(root, 'scripts', 'deploy-web-source-contract.test.mjs'),
  ];
  for (const file of files) {
    if (!exists(file)) {
      fail(`${slash(relative(root, file))} is required`);
      continue;
    }
    const text = readFileSync(file, 'utf8');
    if (text.includes('shell: process.platform ===')) {
      fail(`${slash(relative(root, file))} must not rely on shell: true for Windows command execution`);
    }
  }

  const releaseFile = join(root, 'scripts', 'release-web-source.mjs');
  if (exists(releaseFile)) {
    const text = readFileSync(releaseFile, 'utf8');
    for (const snippet of ['function commandSpec', "'cmd.exe'", 'function cmdArg']) {
      if (!text.includes(snippet)) fail('release-web-source.mjs must wrap Windows pnpm through cmd.exe with escaped args');
    }
  }

  const planFile = join(root, 'scripts', 'web-source-deploy-plan.mjs');
  if (exists(planFile)) {
    const text = readFileSync(planFile, 'utf8');
    for (const snippet of [
      "sqlitePath: '/var/lib/dgbook/dgbook.sqlite'",
      'Environment=DGBOOK_SQLITE_PATH=',
      'Environment=DGBOOK_TRUST_PROXY=1',
      'sqlite-online-backup',
      'db:migrate',
      'db:seed:base',
      'db:seed:demo',
      'db:verify',
      'rollback_release',
      'assert_managed_child',
      'archive sha256',
      'test "$(node --version)" = \'v24.15.0\'',
      'test "$(pnpm --version)" = \'9.15.0\'',
      'find . -type d -name node_modules',
      'pnpm --filter @dgbook/web rebuild better-sqlite3',
      'source SQLite smoke query failed',
      'flock 9',
      'assert_current_matches_snapshot',
      'buildLockedDatabasePreparation',
      'atomic_symlink_swap',
      'mv -Tf -- "$temporary_link" "$link"',
      'ROLLBACK_SKIPPED_NEWER_RELEASE',
      'old-service-enabled',
      'old-service-active',
    ]) {
      if (!text.includes(snippet)) fail(`web-source-deploy-plan.mjs must enforce ${snippet}`);
    }
    if (text.includes('DROP TABLE') || text.includes('db:reset:demo')) {
      fail('web-source-deploy-plan.mjs must remain expand-first and must not reset or destructively migrate production data');
    }
  }

  for (const transport of ['deploy-web-source-ssh.mjs', 'deploy-web-source-paramiko.py']) {
    const file = join(root, 'scripts', transport);
    if (!exists(file)) continue;
    const text = readFileSync(file, 'utf8');
    for (const snippet of ['web-source-deploy-plan.mjs', 'prepare', 'pre-switch', 'switch-and-health', 'rollback', 'prune']) {
      if (!text.includes(snippet)) fail(`${transport} must consume the shared ${snippet} deployment contract`);
    }
  }

  const rootPackageFile = join(root, 'package.json');
  const nodeVersionFile = join(root, '.node-version');
  const lockFile = join(root, 'pnpm-lock.yaml');
  if (!exists(rootPackageFile)) {
    fail('package.json is required for the deployment runtime baseline');
  } else {
    const rootPackage = JSON.parse(readFileSync(rootPackageFile, 'utf8'));
    if (rootPackage.engines?.node !== '24.15.0') fail('package.json engines.node must be exactly 24.15.0');
    if (rootPackage.packageManager !== 'pnpm@9.15.0') fail('package.json packageManager must be exactly pnpm@9.15.0');
  }
  if (!exists(nodeVersionFile) || readFileSync(nodeVersionFile, 'utf8').trim() !== '24.15.0') {
    fail('.node-version must pin Node 24.15.0');
  }
  if (!exists(lockFile)) {
    fail('pnpm-lock.yaml is required for the deployment dependency baseline');
  } else if (!readFileSync(lockFile, 'utf8').includes('better-sqlite3@12.10.0')) {
    fail('pnpm-lock.yaml must pin the Node 24-compatible better-sqlite3 12.10.0');
  }

  const webPackageFile = join(root, 'apps', 'web', 'package.json');
  if (exists(webPackageFile)) {
    const webPackage = JSON.parse(readFileSync(webPackageFile, 'utf8'));
    const scripts = webPackage.scripts ?? {};
    for (const name of ['db', 'db:migrate', 'db:seed:base', 'db:seed:demo', 'db:reset:demo', 'db:verify', 'db:backup']) {
      if (!String(scripts[name] ?? '').startsWith('tsx scripts/db-admin.mjs')) {
        fail(`apps/web package script ${name} must use the Node 24-compatible tsx DB runner`);
      }
    }
    if (webPackage.dependencies?.['better-sqlite3'] !== '12.10.0') {
      fail('apps/web better-sqlite3 must be pinned exactly to 12.10.0');
    }
  }

  const nextConfigFile = join(root, 'apps', 'web', 'next.config.mjs');
  if (exists(nextConfigFile)) {
    const text = readFileSync(nextConfigFile, 'utf8');
    for (const snippet of ['better-sqlite3', './database/**/*', './scripts/db-admin.mjs', './src/platform/db/**/*']) {
      if (!text.includes(snippet)) fail(`next.config.mjs must trace deployment dependency ${snippet}`);
    }
  }
}

function checkCurrentDocsContract() {
  const readmeFile = join(root, 'README.md');
  const productRalphFile = join(root, 'docs', 'architecture', 'product-closure-ralph-loop.md');
  const iterationRalphFile = join(root, 'docs', 'architecture', 'ralph-loop-iteration-plan.md');
  const docs = [readmeFile, productRalphFile, iterationRalphFile];
  for (const file of docs) {
    if (!exists(file)) fail(slash(relative(root, file)) + ' is required by the current design/Ralph documentation contract');
  }
  if (!docs.every(exists)) return;

  const readmeText = readFileSync(readmeFile, 'utf8');
  for (const snippet of ['apps/web', 'TypeScript + React + Next.js']) {
    if (!readmeText.includes(snippet)) fail('README.md must identify the current web platform through ' + snippet);
  }

  const productRalphText = readFileSync(productRalphFile, 'utf8');
  for (const snippet of ['Ralph Loop', 'SQLite', 'Review', 'Analyze', 'Layout', 'Produce', 'Harden']) {
    if (!productRalphText.includes(snippet)) fail('product closure Ralph contract must include ' + snippet);
  }

  const iterationRalphText = readFileSync(iterationRalphFile, 'utf8');
  for (const snippet of [
    '1 名教师、3 名学生',
    'pnpm web:test:unit',
    'pnpm web:typecheck',
    'pnpm web:build',
    'P01/P02/P03',
  ]) {
    if (!iterationRalphText.includes(snippet)) fail('Ralph iteration plan must point to current evidence through ' + snippet);
  }

  const legacyDoc = 'docs/edugame-template-expansion-plan.md';
  for (const [file, text] of [
    [readmeFile, readmeText],
    [productRalphFile, productRalphText],
    [iterationRalphFile, iterationRalphText],
  ]) {
    if (text.includes(legacyDoc)) fail(slash(relative(root, file)) + ' must not point to deleted legacy documentation');
  }
}

function finish() {
  if (failures.length) {
    console.error(`apps/web structure check failed (${failures.length})`);
    for (const item of failures) console.error(`- ${item}`);
    process.exit(1);
  }
  console.log('apps/web structure check passed');
}
