define(['module', 'bart/core'], function (module, core) {
  var waitFuncs = [];
  var ready = false;

  core.onunload(module, 'reload');

  connect.send = function (type, msg) {
    if (ready) connect._ws.send(type+msg);
    else waitFuncs.push(type+msg);
  };

  connect();

  return connect;

  function connect() {
    var location = window.document.location;
    var ws = connect._ws = new WebSocket(location.protocol.replace(/^http/,'ws')+'//' + location.host);
    ws.onmessage = function (event) {

      var data = event.data.slice(1);
      switch(event.data[0]) {
      case 'R':
        reload(data);
        break;
      case 'U':
        core.unload(data);
        break;
      }
    };

    ws.onopen = function (event) {
      for(var i = 0; i < waitFuncs.length; ++i) {
        ws.send(waitFuncs[i]);
      }
      waitFuncs = [];
      ready = true;
    };

    function reload(name) {
      core.unload(name);
      requirejs([name], function() {});
    }
  }
});
