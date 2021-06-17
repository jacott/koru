define((require, exports, module) => {
  'use strict';
  const CodeFormatter   = require('koru/parse/code-formatter');

  return (ws, _clients, input) => {
    ws.send('IF' + JSON.stringify({ source: CodeFormatter.reformat(input) }));
  };
});
