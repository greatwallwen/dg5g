export function parseHelperArgs(argv, env = process.env) {
  const values = new Map();
  let headless = false;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--') continue;
    if (argument === '--headless') {
      headless = true;
      continue;
    }
    if (!argument?.startsWith('--')) throw new Error(`Unknown Classroom Helper argument: ${argument}`);
    const value = argv[index + 1];
    if (value === undefined || value.startsWith('--')) throw new Error(`Missing value for ${argument}`);
    values.set(argument, value);
    index += 1;
  }

  const sessionId = values.get('--session')?.trim();
  if (!sessionId) throw new Error('Classroom Helper session is required.');
  const students = (values.get('--students') ?? '')
    .split(',')
    .map((student) => student.trim())
    .filter(Boolean);
  if (!students.length) throw new Error('Classroom Helper requires at least one student.');
  const demoPassword = env.DGBOOK_DEMO_PASSWORD?.trim();
  if (!demoPassword) throw new Error('Classroom Helper requires DGBOOK_DEMO_PASSWORD.');
  const baseUrl = normalizeBaseUrl(values.get('--base-url') ?? 'http://127.0.0.1:3157');
  const healthPort = Number(values.get('--health-port') ?? 17352);
  if (!Number.isInteger(healthPort) || healthPort < 1 || healthPort > 65535) throw new Error('Classroom Helper health port is invalid.');

  return {
    baseUrl,
    sessionId,
    students: [...new Set(students)],
    demoPassword,
    token: values.get('--token') ?? env.DGBOOK_HELPER_TOKEN ?? 'dgbook-helper-demo-2026',
    healthPort,
    headless,
  };
}

export function studentPageUrl(config) {
  const url = new URL(`/classroom/${encodeURIComponent(config.sessionId)}`, `${config.baseUrl}/`);
  return url.toString();
}

export function studentUsername(studentId) {
  const match = /^stu-(\d+)$/.exec(String(studentId));
  if (!match) throw new Error(`Unsupported Classroom Helper student id: ${studentId}`);
  return `student${match[1].padStart(2, '0')}`;
}

export function shouldApplyCommand(lastAppliedRevision, command, studentId, lastAppliedCommandId) {
  if (!command || !Number.isInteger(command.revision)) return false;
  if (command.studentId && command.studentId !== studentId) return false;
  if (command.commandId && lastAppliedCommandId) return command.commandId !== lastAppliedCommandId;
  return command.revision > lastAppliedRevision;
}

export function shouldReloadForCommand(lastAppliedRevision, lastAppliedCommandId, command) {
  return Boolean(
    command?.commandId
    && lastAppliedCommandId
    && command.commandId !== lastAppliedCommandId
    && Number.isInteger(command.revision)
    && command.revision <= lastAppliedRevision,
  );
}

export function helperHealth(config) {
  return {
    status: 'online',
    sessionId: config.sessionId,
    students: [...config.students],
  };
}

export function simulatorPayload(payload) {
  return {
    ...payload,
    clientKind: 'helper-simulator',
  };
}

function normalizeBaseUrl(value) {
  const url = new URL(value);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('Classroom Helper base URL must use HTTP or HTTPS.');
  return url.toString().replace(/\/$/, '');
}
