define(function () {
  var waitFuncs = [];
  var ready = false;

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
        unload(data);
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

    function unload(name) {
      console.log('INFO: unload',name);

      requirejs.undef(name);
    }

    function reload(name) {
      unload(name);
      requirejs([name], function() {});
    }
  }
});
