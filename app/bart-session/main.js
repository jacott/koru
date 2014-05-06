define(function () {
  // FIXME add whenReady callback

  connect.send = function (type, msg) {
    connect._ws.send(type+msg);
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
