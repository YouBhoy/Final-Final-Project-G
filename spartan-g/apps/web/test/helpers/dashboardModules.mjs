import { createRequire } from 'node:module';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
const require = createRequire(import.meta.url);
const sourceRoot = fileURLToPath(new URL('../../src/', import.meta.url));

/** Execute real web modules with explicit Firebase/service doubles; no SDK/network. */
export function dashboardModules(mocks = {}) {
  const modules = new Map();
  function load(name) {
    const filename = path.isAbsolute(name) ? name : path.resolve(sourceRoot, name);
    if (modules.has(filename)) return modules.get(filename).exports;
    const module = { exports: {} }; modules.set(filename, module);
    const code = ts.transpileModule(readFileSync(filename, 'utf8'), { compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX,
    } }).outputText;
    const resolve = specifier => {
      if (Object.hasOwn(mocks, specifier)) return mocks[specifier];
      if (specifier === 'react' || specifier === 'react/jsx-runtime') return require(specifier);
      if (specifier.startsWith('.')) {
        const stem = path.resolve(path.dirname(filename), specifier);
        const target = ['.ts', '.tsx'].map(ext => stem + ext).find(file => existsSync(file));
        if (Object.hasOwn(mocks, target)) return mocks[target];
        if (target) return load(target);
      }
      throw new Error('Unmocked boundary: ' + specifier);
    };
    new Function('require', 'module', 'exports', code)(resolve, module, module.exports);
    return module.exports;
  }
  return { load, filename: name => path.resolve(sourceRoot, name) };
}

export function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

export function dashboardFixture(role = 'student') {
  const state = {
    user: { uid: role + '-one', role }, profile: { role, isActive: true }, tab: true,
    appointments: [], notifications: [], published: [], submitted: [], active: {}, alerts: [],
    reads: { appointments: 0, catalog: 0, submitted: 0, progress: [], notifications: 0, profile: 0 },
    listeners: [], conversations: [],
  };
  const services = {
    appointmentService: {
      getAppointments: async (uid, actor) => { state.reads.appointments++; state.lastAppointmentScope = [uid, actor]; return state.appointmentRead ? state.appointmentRead() : state.appointments; },
      getStudentAppointments: async (uid, actor) => { state.reads.appointments++; state.lastAppointmentScope = [uid, actor]; return state.appointmentRead ? state.appointmentRead() : state.appointments; },
      getUpcoming: () => { throw new Error('Duplicate upcoming query forbidden'); },
      getAllNotifications: async uid => { state.reads.notifications++; state.lastNotificationUid = uid; if (state.notificationError) throw state.notificationError; return state.notifications; },
    },
    assessmentService: {
      getAttemptsByStudent: async uid => { state.reads.submitted++; state.lastStudentUid = uid; if (state.submittedRead) return state.submittedRead(); return state.submitted; },
      getInProgressAttempt: async (id, uid) => { state.reads.progress.push([id, uid]); return state.progressRead ? state.progressRead(id) : state.active[id] ?? null; },
    },
    userService: { getUser: async () => ({ displayName: 'Staff label' }) },
    messagingService: { subscribeToConversations: (uid, actor, next, error) => {
      const listener = { uid, actor, next, error, stopped: false }; state.conversations.push(listener);
      next([]); return () => { listener.stopped = true; };
    } },
  };
  const auth = { get currentUser() { return state.user; } };
  const mocks = {
    '@spartan-g/shared-services': services,
    'firebase/firestore': {
      doc: (_, name, uid) => ({ name, uid }), collection: (_, name) => ({ name }), where: (...args) => args,
      query: (ref, ...constraints) => ({ ...ref, constraints }),
      getDocFromServer: async ref => {
        state.reads.profile++; state.profileRef = ref;
        if (state.profileError) throw state.profileError;
        return { exists: () => !!state.profile, data: () => state.profile };
      },
      onSnapshot: (ref, options, next, error) => {
        const listener = { ref, options, next, error, stopped: false }; state.listeners.push(listener);
        return () => { listener.stopped = true; };
      },
    },
    '../firebase/firebase': { auth, db: { app: { options: { projectId: 'synthetic-test-project' } } } },
    './adminTabSession': { hasPortalTabSession: () => state.tab },
    './assessmentDefinitions': { getPublishedAssessmentDefinitions: async () => { state.reads.catalog++; return state.published; } },
    '../lib/facilitatorAccess': { getAssignedRiskAlerts: async () => { if (state.riskError) throw state.riskError; return state.alerts; } },
    '../lib/studentIdentity': {
      resolveStudentIdentity: async (...args) => state.identityRead ? state.identityRead(...args) : ({ displayName: 'Permitted student label' }),
      studentAlias: () => 'Student alias',
    },
    './useAuth': { useAuth: () => ({ user: state.user }) },
  };
  const modules = dashboardModules(mocks);
  const runtime = modules.load('lib/dashboardRuntime.ts');
  runtime.setDashboardSession(state.user);
  return { state, modules, runtime, services, scope: () => runtime.dashboardScope(state.user.uid, state.user.role),
    switchUser(user) { state.user = user; state.profile = user ? { role: user.role, isActive: true } : null; runtime.setDashboardSession(user); },
    emit(name, error) {
      for (const listener of state.listeners.filter(item => item.ref.name === name && !item.stopped)) {
        if (error) listener.error(error); else listener.next({ metadata: { fromCache: false, hasPendingWrites: false } });
      }
    },
  };
}
