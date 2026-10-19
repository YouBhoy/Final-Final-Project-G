(function () {
  // Evaluated only in the isolated Android development JS context. No Auth tokens read.
  var checks = [], all = Array.from(globalThis.__r.getModules()).map(function(p) { return [p[0], { verboseName: String(p[1].verboseName || '').replace(/\\/g, '/') }]; });
  function check(name, passed) { checks.push({ name: name, passed: !!passed }); }
  var pair = all.find(function (p) { return /react-native\/Libraries\/BatchedBridge\/NativeModules\.js$/.test(p[1].verboseName || ''); });
  if (!pair) throw Error('NativeModules debug module unavailable');
  var imported = globalThis.__r(pair[0]), modules = imported.default || imported, b = modules.SpartanGardenHttp;
  check('real Android bridge registered', !!b);
  check('three minimum native methods exposed', b && ['getConfiguration', 'request', 'cancel'].every(function (k) { return typeof b[k] === 'function'; }));
  if (!b) return { checks: checks };
  var refs = [globalThis.fetch, globalThis.XMLHttpRequest, globalThis.WebSocket], configuration;
  var token = 'phase7c.synthetic.not-a-real-token';
  return b.getConfiguration().then(function (c) {
    configuration = c;
    check('native version one', c.version === 1);
    check('native routing disabled', c.enabled === false);
    check('no approved native origin', c.origin === null);
    return ['waterGarden', 'recoverAssessmentReward', 'finalizeAssessment'].reduce(function (chain, action) {
      return chain.then(function () {
        return b.request('d91d20a4-45ab-4fe0-bc27-134921f8d826', action, action === 'waterGarden' ? '644ecf80-4750-4619-a7e5-cba18b101188' : 'synthetic-attempt', token, 1000).then(function () {
          check(action + ' fails closed before HTTP', false);
        }, function (e) {
          check(action + ' fails closed before HTTP', e.code === 'E_GARDEN_TRANSPORT' && e.userInfo && e.userInfo.reason === 'configuration_disabled');
          check(action + ' returns sanitized promise error', e.message === 'Garden request could not be confirmed.' && JSON.stringify(e).indexOf(token) === -1 && e.userInfo && e.userInfo.retryable === false && e.userInfo.outcomeUnknown === false);
        });
      });
    }, Promise.resolve());
  }).then(function () {
    return Promise.all(Array.from({ length: 8 }, function () {
      return b.request('d91d20a4-45ab-4fe0-bc27-134921f8d826', 'waterGarden', '644ecf80-4750-4619-a7e5-cba18b101188', token, 1000).then(function () { return false; }, function (e) { return e.userInfo && e.userInfo.reason === 'configuration_disabled'; });
    }));
  }).then(function (results) {
    check('concurrent bridge promises settle independently', results.every(Boolean));
    return b.cancel('04e83b4b-69db-44c0-b3f6-5d6c71083673');
  }).then(function (value) {
    check('unknown cancellation returns false', value === false);
    return b.cancel('04e83b4b-69db-44c0-b3f6-5d6c71083673');
  }).then(function (value) {
    check('repeat cancellation is safe', value === false);
    check('Garden bridge calls preserve existing JS networking', refs[0] === globalThis.fetch && refs[1] === globalThis.XMLHttpRequest && refs[2] === globalThis.WebSocket);
    var fonts = [], fontPair = all.find(function (p) { return /expo-font\/build\/index\.js$/.test(p[1].verboseName || ''); });
    if (fontPair) { var font = globalThis.__r(fontPair[0]); if (typeof font.getLoadedFonts === 'function') fonts = font.getLoadedFonts(); }
    var appPair = all.find(function (p) { return /packages\/shared-services\/src\/firebase\/app\.ts$/.test(p[1].verboseName || ''); });
    var authPair = all.find(function (p) { return /packages\/shared-services\/src\/firebase\/auth\.ts$/.test(p[1].verboseName || ''); });
    var firebase = null;
    if (appPair && authPair) {
      var app = globalThis.__r(appPair[0]).getFirebaseApp(), auth = globalThis.__r(authPair[0]).getFirebaseAuth();
      firebase = { appName: app.name, projectId: app.options.projectId, authHost: auth.emulatorConfig.host, authPort: auth.emulatorConfig.port, syntheticUser: !!auth.currentUser && auth.currentUser.uid.indexOf('local-garden-') === 0 };
      check('named synthetic Firebase app only', firebase.appName === 'spartan-local-garden' && firebase.projectId === 'demo-spartan-g-garden-phase2');
      check('Auth routes to local emulator', firebase.authHost === '10.0.2.2' && firebase.authPort === 19099);
      check('signed-in account is synthetic', firebase.syntheticUser);
    } else check('local Firebase modules found', false);
    return { checks: checks, configuration: configuration, fonts: fonts, firebase: firebase, enabledHttpTransportExercised: false, realCredentialsUsed: false };
  });
})()
