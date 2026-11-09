/** Hidden page running the Web Playback SDK, bridged to the app with JSON messages. */
export const PLAYER_PAGE_HTML = String.raw`<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width">
<title>Soundport playback</title>
</head>
<body>
<script>
(function () {
  'use strict';

  function send(message) {
    var json = JSON.stringify(message);
    try {
      if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.soundport) {
        window.webkit.messageHandlers.soundport.postMessage(json);
      } else if (window.chrome && window.chrome.webview) {
        window.chrome.webview.postMessage(json);
      } else {
        console.log('__soundport__' + json);
      }
    } catch (e) {}
  }

  var options = null;
  var sdkReady = false;
  var player = null;
  var tokenCallbacks = [];

  function errorText(e) {
    return (e && (e.message || e.name)) || String(e);
  }

  window.addEventListener('error', function (e) {
    send({ type: 'log', level: 'error', message: errorText(e.error || e.message) });
  });

  // Without a DRM key system the SDK connects but can't play.
  function probeDrm() {
    if (!navigator.requestMediaKeySystemAccess) {
      return Promise.resolve([]);
    }
    var systems = [
      'com.widevine.alpha',
      'com.microsoft.playready.recommendation',
      'com.microsoft.playready',
      'com.apple.fps',
      'com.apple.fps.1_0'
    ];
    var config = [{
      initDataTypes: ['cenc', 'sinf', 'skd'],
      audioCapabilities: [
        { contentType: 'audio/mp4; codecs="mp4a.40.2"' },
        { contentType: 'audio/mp4; codecs="flac"' },
        { contentType: 'audio/webm; codecs="vorbis"' }
      ]
    }];
    return Promise.all(systems.map(function (system) {
      return navigator.requestMediaKeySystemAccess(system, config)
        .then(function () { return system; })
        .catch(function () { return null; });
    })).then(function (found) {
      return found.filter(Boolean);
    });
  }

  function summarize(state) {
    if (!state) {
      return null;
    }
    var track = state.track_window && state.track_window.current_track;
    return {
      paused: state.paused,
      position: state.position,
      duration: state.duration,
      shuffle: state.shuffle,
      repeatMode: state.repeat_mode,
      timestamp: state.timestamp,
      trackUri: track ? track.uri : null
    };
  }

  function start() {
    if (!sdkReady || !options || player) {
      return;
    }
    player = new window.Spotify.Player({
      name: options.name,
      volume: options.volume,
      getOAuthToken: function (callback) {
        tokenCallbacks.push(callback);
        send({ type: 'token-request' });
      }
    });

    player.addListener('ready', function (e) {
      send({ type: 'ready', deviceId: e.device_id });
    });
    player.addListener('not_ready', function (e) {
      send({ type: 'not-ready', deviceId: e.device_id });
    });
    player.addListener('player_state_changed', function (state) {
      send({ type: 'state', state: summarize(state) });
    });
    ['initialization_error', 'authentication_error', 'account_error', 'playback_error'].forEach(function (kind) {
      player.addListener(kind, function (e) {
        send({ type: 'error', kind: kind, message: e && e.message });
      });
    });
    player.addListener('autoplay_failed', function () {
      send({ type: 'error', kind: 'autoplay_failed', message: 'The web view blocked autoplay.' });
    });

    player.connect().then(function (ok) {
      send({ type: 'connected', ok: ok });
    });
  }

  window.onSpotifyWebPlaybackSDKReady = function () {
    sdkReady = true;
    start();
  };

  window.__soundport = {
    receive: function (message) {
      switch (message.type) {
        case 'init':
          options = { name: message.name, volume: message.volume };
          start();
          break;
        case 'token':
          var callbacks = tokenCallbacks;
          tokenCallbacks = [];
          callbacks.forEach(function (cb) { cb(message.token); });
          break;
        case 'command':
          if (!player || typeof player[message.name] !== 'function') {
            return;
          }
          Promise.resolve()
            .then(function () { return player[message.name].apply(player, message.args || []); })
            .catch(function (e) {
              send({ type: 'error', kind: 'command', message: message.name + ': ' + errorText(e) });
            });
          break;
        case 'disconnect':
          if (player) {
            player.disconnect();
            player = null;
          }
          break;
      }
    }
  };

  probeDrm().then(function (keySystems) {
    send({
      type: 'boot',
      keySystems: keySystems,
      secure: window.isSecureContext,
      userAgent: navigator.userAgent
    });
    var script = document.createElement('script');
    script.src = 'https://sdk.scdn.co/spotify-player.js';
    script.onerror = function () {
      send({ type: 'error', kind: 'load', message: 'Could not load the Spotify Web Playback SDK.' });
    };
    document.head.appendChild(script);
  });
})();
</script>
</body>
</html>`;

/** EME requires a secure context. */
export const PLAYER_PAGE_ORIGIN = 'https://soundport.local/';
