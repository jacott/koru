define(['module', 'bart/core'], function (module, core) {
  var waitFuncs = [];
  var ready = false;
  var retryCount = 0;
  var versionHash;

  core.onunload(module, 'reload');

  connect.send = function (type, msg) {
    if (ready) connect._ws.send(type+msg);
    else waitFuncs.push(type+msg);
  };

  connect();

  return connect;

  function url() {
    var location = window.document.location;
    return location.protocol.replace(/^http/,'ws')+'//' + location.host;
  }

  function connect() {
    var ws = connect._ws = new WebSocket(url());
    ws.onmessage = function (event) {

      var data = event.data.slice(1);
      switch(event.data[0]) {
      case 'X':
        if (versionHash && versionHash !== data)
          core.reload(); // FIXME we want to send queued messages first
        versionHash = data;
        ws.send('X'+ core.engine);
        for(var i = 0; i < waitFuncs.length; ++i) {
          ws.send(waitFuncs[i]);
        }
        waitFuncs = [];
        ready = true;
        retryCount = 0;
        break;
      case 'L':
        loadId(data);
        break;
      case 'U':
        var args = data.split(':');
        versionHash = args[0];
        core.unload(args[1]);
        break;
      }
    };

    ws.onclose = function (event) {
      ready = false;
      ws = null;
      retryCount = Math.min(40, retryCount * 1.5 + 1);

      setTimeout(connect, retryCount*500);
    };
  }

  function loadId(name) {
    requirejs([name], function() {});
  }
});
