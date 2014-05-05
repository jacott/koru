console.log('DEBUG bart-session 2');

define(function () {
  return connect;
});

connect();


function connect() {
  var location = window.document.location;
  console.log('DEBUG location',location);

  var ws = connect._ws = new WebSocket(location.protocol.replace(/^http/,'ws')+'//' + location.host);
  ws.onmessage = function (event) {
    updateStats(event.data);
  };

  function updateStats(arg) {
    var name = arg.split(':')[1];
    requirejs([name], function() {console.log('DEBUG loaded', arguments)});

    console.log('DEBUG ws: ',arg );
  }

  console.log('DEBUG ws',ws);
}

connect.send = function (type, msg) {
  connect._ws.send(type+':'+msg);
};
