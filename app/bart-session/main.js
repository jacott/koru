define(function () {
  connect.send = function (type, msg) {
    connect._ws.send(type+msg);
  };

  connect();

  return connect;

  function connect() {
    var location = window.document.location;
    var ws = connect._ws = new WebSocket(location.protocol.replace(/^http/,'ws')+'//' + location.host);
    ws.onmessage = function (event) {

      var name = event.data.slice(1);
      load(name);
    };

    function load(name) {
      requirejs([name], function() {});
    }
  }
});
