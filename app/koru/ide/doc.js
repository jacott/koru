define((require, exports, module) => {
  'use strict';
  const Intercept       = require('koru/test/intercept');

  return (ws, clients, data) => {
    const [name] = data.split("\t", 1);
    if (Intercept.interceptObj !== void 0) {
      ws.send('ID' + JSON.stringify(Intercept.objectSource(name)));
    } else {
      for (const key in clients) {
        const cs = clients[key],{ conns } = cs;
        for (const conn of conns.keys()) {
          conn.ws.send('D' + name);
          break;
        }
        break;
      }
    }
  };
});
