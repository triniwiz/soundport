/*
 * Soundport's bridge into Spotify's web player, injected at document start.
 * It reaches the player's internal services (resolved by name from its
 * dependency container) and its GraphQL API, and relays calls, results and
 * player state to the app.
 */
(function () {
  'use strict';
  if (window.__soundportBridge) {
    return;
  }

  // -- Messaging -------------------------------------------------------------

  function send(message) {
    var json;
    try {
      json = JSON.stringify(message);
    } catch (e) {
      json = JSON.stringify({ type: 'log', level: 'error', message: 'unserializable message: ' + message.type });
    }
    try {
      if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.soundport) {
        window.webkit.messageHandlers.soundport.postMessage(json);
      } else if (window.chrome && window.chrome.webview) {
        window.chrome.webview.postMessage(json);
      } else if (typeof window.__soundportSend === 'function') {
        window.__soundportSend(json);
      } else {
        console.log('__soundport__' + json);
      }
    } catch (e) {}
  }

  function log(level, message) {
    send({ type: 'log', level: level, message: String(message) });
  }

  // Forward page errors and warnings to the app log.
  ['error', 'warn'].forEach(function (level) {
    var original = console[level];
    console[level] = function () {
      try {
        var text = Array.prototype.map
          .call(arguments, function (a) {
            return a && a.message ? a.message : typeof a === 'object' ? JSON.stringify(a) : String(a);
          })
          .join(' ');
        log(level, text.slice(0, 400));
      } catch (e) {}
      return original.apply(console, arguments);
    };
  });

  // -- Media and DRM diagnostics ---------------------------------------------
  var trackedMedia = typeof WeakSet !== 'undefined' ? new WeakSet() : null;
  function trackMedia(element) {
    if (!trackedMedia || trackedMedia.has(element)) return;
    trackedMedia.add(element);
    ['playing', 'waiting', 'stalled', 'pause', 'ended', 'error', 'emptied', 'encrypted'].forEach(function (name) {
      element.addEventListener(name, function () {
        log(
          'info',
          'media ' + name + ' t=' + (element.currentTime || 0).toFixed(1) + ' ready=' + element.readyState +
            ' net=' + element.networkState + (element.error ? ' error=' + element.error.code + ' ' + element.error.message : ''),
        );
      });
    });
  }
  if (typeof HTMLMediaElement !== 'undefined') {
    var mediaPlay = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () {
      trackMedia(this);
      return mediaPlay.apply(this, arguments);
    };
  }
  if (navigator.requestMediaKeySystemAccess) {
    var requestAccess = navigator.requestMediaKeySystemAccess.bind(navigator);
    navigator.requestMediaKeySystemAccess = function (keySystem, configs) {
      return requestAccess(keySystem, configs).then(
        function (access) {
          log('info', 'drm access ' + keySystem + ': ok');
          return access;
        },
        function (error) {
          log('info', 'drm access ' + keySystem + ': ' + ((error && error.name) || error));
          throw error;
        },
      );
    };
  }
  if (typeof MediaKeys !== 'undefined' && MediaKeys.prototype.createSession) {
    var createSession = MediaKeys.prototype.createSession;
    MediaKeys.prototype.createSession = function () {
      var session = createSession.apply(this, arguments);
      try {
        session.addEventListener('keystatuseschange', function () {
          var statuses = [];
          session.keyStatuses.forEach(function (status) {
            statuses.push(status);
          });
          log('info', 'drm key statuses: ' + statuses.join(','));
        });
        session.addEventListener('message', function (event) {
          log('info', 'drm message ' + event.messageType);
        });
      } catch (e) {}
      return session;
    };
  }

  window.addEventListener('unhandledrejection', function (event) {
    var reason = event.reason;
    log('error', 'unhandled: ' + String((reason && (reason.message || reason.name)) || reason).slice(0, 400));
  });
  window.addEventListener(
    'error',
    function (event) {
      var target = event.target;
      if (target && (target.tagName === 'AUDIO' || target.tagName === 'VIDEO')) {
        var error = target.error;
        log('error', 'media element error ' + (error ? error.code + ' ' + error.message : ''));
      }
    },
    true,
  );

  /** JSON-safe copy: no functions or cycles, limited depth. */
  function plain(value, depth, seen) {
    depth = depth === undefined ? 10 : depth;
    seen = seen || new WeakSet();
    if (value === null || value === undefined) return value === undefined ? null : value;
    var type = typeof value;
    if (type === 'string' || type === 'number' || type === 'boolean') return value;
    if (type === 'bigint') return String(value);
    if (type === 'function' || type === 'symbol') return undefined;
    if (depth <= 0 || seen.has(value)) return undefined;
    seen.add(value);
    if (value instanceof Map) value = Array.from(value.entries());
    else if (value instanceof Set) value = Array.from(value);
    if (Array.isArray(value)) {
      var list = [];
      for (var i = 0; i < value.length && i < 500; i++) list.push(plain(value[i], depth - 1, seen));
      return list;
    }
    var out = {};
    for (var key in value) {
      if (key.charAt(0) === '_') continue;
      var v;
      try {
        v = value[key];
      } catch (e) {
        continue;
      }
      var p = plain(v, depth - 1, seen);
      if (p !== undefined) out[key] = p;
    }
    return out;
  }

  // -- Module loader and service container -----------------------------------

  var moduleRequire = null;
  var examined = new Set();
  var containers = new Set();
  var instrumented = new WeakSet();

  function isContainerPrototype(proto) {
    return !!proto && typeof proto.resolve === 'function' && typeof proto.registerFactory === 'function';
  }

  /** Makes every container record itself when used. */
  function instrumentPrototype(proto) {
    if (instrumented.has(proto)) return;
    instrumented.add(proto);
    ['resolve', 'registerFactory', 'registerValue'].forEach(function (name) {
      var original = proto[name];
      if (typeof original !== 'function') return;
      proto[name] = function () {
        containers.add(this);
        return original.apply(this, arguments);
      };
    });
  }

  /** The module may export only a factory; a throwaway instance gives the prototype. */
  function instrumentExports(exports) {
    if (!exports) return;
    Object.keys(exports).forEach(function (key) {
      var value;
      try {
        value = exports[key];
      } catch (e) {
        return;
      }
      if (typeof value !== 'function') return;
      if (isContainerPrototype(value.prototype)) {
        instrumentPrototype(value.prototype);
        return;
      }
      var source = '';
      try {
        source = Function.prototype.toString.call(value);
      } catch (e) {}
      if (source.length < 300 && /return new [\w$]+\(/.test(source)) {
        try {
          var probe = value();
          var proto = probe && Object.getPrototypeOf(probe);
          if (isContainerPrototype(proto)) instrumentPrototype(proto);
        } catch (e) {}
      }
    });
  }

  /** Instruments the container module before it runs (or right away, if it has). */
  function examineModules() {
    if (!moduleRequire || !moduleRequire.m) return;
    var factories = moduleRequire.m;
    Object.keys(factories).forEach(function (id) {
      if (examined.has(id)) return;
      examined.add(id);
      var factory = factories[id];
      var source;
      try {
        source = Function.prototype.toString.call(factory);
      } catch (e) {
        return;
      }
      if (source.indexOf('registerFactory(') < 0 || source.indexOf('registerImpl(') < 0) return;
      var cached = moduleRequire.c && moduleRequire.c[id];
      if (cached) {
        instrumentExports(cached.exports);
        return;
      }
      factories[id] = function (module) {
        var result = factory.apply(this, arguments);
        try {
          instrumentExports(module.exports);
        } catch (e) {}
        return result;
      };
    });
  }

  var chunks = (self.rspackChunk = self.rspackChunk || []);
  var arrayPush = chunks.push.bind(chunks);
  // The runtime's loader calls this after registering a chunk's modules, before running them.
  chunks.push = function () {
    try {
      examineModules();
    } catch (e) {}
    return arrayPush.apply(null, arguments);
  };
  chunks.push([
    ['soundport-bridge'],
    {},
    function (require) {
      moduleRequire = require;
      try {
        examineModules();
      } catch (e) {}
    },
  ]);

  function service(name) {
    var token = Symbol.for(name);
    var found = null;
    containers.forEach(function (container) {
      if (found) return;
      try {
        found = container.resolve(token) || null;
      } catch (e) {}
    });
    return found;
  }

  function methodsOf(object) {
    var names = new Set();
    var proto = object;
    while (proto && proto !== Object.prototype) {
      Object.getOwnPropertyNames(proto).forEach(function (n) {
        if (n !== 'constructor' && n.charAt(0) !== '_') {
          try {
            if (typeof object[n] === 'function') names.add(n);
          } catch (e) {}
        }
      });
      proto = Object.getPrototypeOf(proto);
    }
    return Array.from(names).sort();
  }

  // -- GraphQL ---------------------------------------------------------------

  var KEEP_HEADERS = ['authorization', 'client-token', 'spotify-app-version', 'app-platform', 'accept-language'];
  var graphqlHeaders = null;
  var graphqlUrl = null;
  var operations = {};

  function headersOf(headers) {
    var out = {};
    if (!headers) return out;
    if (typeof Headers !== 'undefined' && headers instanceof Headers) {
      headers.forEach(function (v, k) {
        out[k.toLowerCase()] = v;
      });
    } else if (Array.isArray(headers)) {
      headers.forEach(function (pair) {
        out[String(pair[0]).toLowerCase()] = pair[1];
      });
    } else {
      Object.keys(headers).forEach(function (k) {
        out[k.toLowerCase()] = headers[k];
      });
    }
    return out;
  }

  var nativeFetch = window.fetch;
  window.fetch = function (input, init) {
    try {
      var request = typeof Request !== 'undefined' && input instanceof Request ? input : null;
      var url = String(request ? request.url : input);
      if (url.indexOf('/pathfinder/') >= 0) {
        var seen = Object.assign(headersOf(request && request.headers), headersOf(init && init.headers));
        if (seen.authorization) {
          var kept = {};
          KEEP_HEADERS.forEach(function (k) {
            if (seen[k]) kept[k] = seen[k];
          });
          var first = !graphqlHeaders;
          graphqlHeaders = kept;
          graphqlUrl = url.split('?')[0];
          if (first) send({ type: 'graphql-ready' });
        }
      }
    } catch (e) {}
    return nativeFetch.apply(this, arguments);
  };

  var OPERATION = /"([A-Za-z0-9_]+)","(?:query|mutation)","([0-9a-f]{64})"/g;

  function scanOperations() {
    if (!moduleRequire || !moduleRequire.m) return;
    Object.keys(moduleRequire.m).forEach(function (id) {
      var source;
      try {
        source = Function.prototype.toString.call(moduleRequire.m[id]);
      } catch (e) {
        return;
      }
      if (source.indexOf('","query","') < 0 && source.indexOf('","mutation","') < 0) return;
      var match;
      OPERATION.lastIndex = 0;
      while ((match = OPERATION.exec(source))) {
        operations[match[1]] = match[2];
      }
    });
  }

  function waitFor(test, timeout) {
    return new Promise(function (resolve) {
      var started = Date.now();
      (function check() {
        var value = test();
        if (value || Date.now() - started > timeout) resolve(value);
        else setTimeout(check, 100);
      })();
    });
  }

  /** Operations in lazy chunks load with their page: visit it through the router, then return. */
  var ROUTES_FOR = { search: '/search' };
  var visited = {};

  function loadOperation(name) {
    scanOperations();
    if (operations[name]) return Promise.resolve(operations[name]);
    var prefix = Object.keys(ROUTES_FOR).find(function (p) {
      return name.toLowerCase().indexOf(p) === 0;
    });
    if (!prefix || visited[prefix]) return Promise.resolve(null);
    visited[prefix] = true;
    var back = location.pathname + location.search;
    history.pushState(history.state, '', ROUTES_FOR[prefix]);
    dispatchEvent(new PopStateEvent('popstate', { state: history.state }));
    return waitFor(function () {
      scanOperations();
      return operations[name];
    }, 15000).then(function (hash) {
      history.pushState(history.state, '', back);
      dispatchEvent(new PopStateEvent('popstate', { state: history.state }));
      return hash || null;
    });
  }

  function graphql(name, variables) {
    return loadOperation(name).then(function (hash) {
      if (!hash) throw new Error('Unknown GraphQL operation: ' + name);
      return signedQuery(name, hash, variables);
    });
  }

  function signedQuery(name, hash, variables) {
    return waitFor(function () {
      return graphqlHeaders;
    }, 20000).then(function (headers) {
      if (!headers) throw new Error('The web player has not made a signed request yet');
      return nativeFetch(graphqlUrl, {
        method: 'POST',
        headers: Object.assign(
          { 'content-type': 'application/json;charset=UTF-8', accept: 'application/json' },
          headers,
        ),
        body: JSON.stringify({
          variables: variables || {},
          operationName: name,
          extensions: { persistedQuery: { version: 1, sha256Hash: hash } },
        }),
      }).then(function (response) {
        return response.json().then(function (body) {
          if (!response.ok) throw new Error('GraphQL ' + name + ': HTTP ' + response.status);
          return body;
        });
      });
    });
  }

  // -- Player state ----------------------------------------------------------

  var watching = false;
  var stateTimer = null;

  /** Player state without the previous/next queues. */
  function currentState() {
    var player = service('PlayerAPI');
    var state = player && player.getState();
    if (!state) return null;
    var out = {};
    for (var key in state) {
      if (key !== 'previousItems' && key !== 'nextItems') out[key] = state[key];
    }
    return out;
  }

  function sendState() {
    stateTimer = null;
    var player = service('PlayerAPI');
    if (!player) return;
    try {
      send({ type: 'state', state: plain(currentState(), 7) });
    } catch (e) {
      log('error', 'state: ' + e);
    }
  }

  function watchPlayer() {
    if (watching) return true;
    var player = service('PlayerAPI');
    if (!player || typeof player.getEvents !== 'function') return false;
    watching = true;
    try {
      player.getEvents().addListener('update', function () {
        if (!stateTimer) stateTimer = setTimeout(sendState, 120);
      });
    } catch (e) {
      log('error', 'events: ' + e);
    }
    send({ type: 'ready' });
    sendState();
    return true;
  }

  (function poll() {
    if (!watchPlayer()) setTimeout(poll, 250);
  })();

  // -- App → page ------------------------------------------------------------

  function handle(kind, payload) {
    switch (kind) {
      case 'invoke': {
        var target = service(payload.service);
        if (!target) throw new Error('Service not available: ' + payload.service);
        var fn = target[payload.method];
        if (typeof fn !== 'function') throw new Error(payload.service + '.' + payload.method + ' is not a function');
        return fn.apply(target, payload.args || []);
      }
      case 'graphql':
        return graphql(payload.name, payload.variables);
      case 'state':
        return currentState();
      case 'describe': {
        var out = {};
        (payload.services || []).forEach(function (name) {
          var s = service(name);
          out[name] = s ? methodsOf(s) : null;
        });
        return out;
      }
      case 'status':
        return {
          require: !!moduleRequire,
          containers: containers.size,
          player: !!service('PlayerAPI'),
          graphql: !!graphqlHeaders,
          operations: Object.keys(operations).length,
        };
      default:
        throw new Error('Unknown request: ' + kind);
    }
  }

  window.__soundportBridge = {
    call: function (id, kind, payload) {
      Promise.resolve()
        .then(function () {
          return handle(kind, payload || {});
        })
        .then(
          function (value) {
            var depth = kind === 'graphql' ? 40 : (payload && payload.depth) || 8;
            send({ type: 'result', id: id, ok: true, value: plain(value, depth) });
          },
          function (error) {
            send({ type: 'result', id: id, ok: false, error: String((error && error.message) || error) });
          },
        );
    },
  };
})();
