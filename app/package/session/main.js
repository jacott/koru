define(function () {
  var location = window.document.location;
  console.log('DEBUG location',location);

  var ws = new WebSocket(location.protocol.replace(/^http/,'ws')+'//' + location.host);
  ws.onmessage = function (event) {
    updateStats(JSON.parse(event.data));
  };

  function updateStats(arg) {
    console.log('DEBUG ws: ',arg );
  }

  console.log('DEBUG ws',ws);
});
