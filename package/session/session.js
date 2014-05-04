define(function () {
  var host = window.document.location.host.replace(/:.*/, '');
  var ws = new WebSocket('ws://' + host + ':3000');
  ws.onmessage = function (event) {
    updateStats(JSON.parse(event.data));
  };

  function updateStats(arg) {
    console.log('DEBUG ws: ',arg );

  }

  console.log('DEBUG ws',ws);

  WS = ws;

});
