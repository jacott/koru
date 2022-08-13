define((require, exports, module) => {
  'use strict';
  const koru            = require('koru');
  const CodeFormatter   = require('koru/parse/code-formatter');

  return (ws, _clients, input) => {
    try {
      ws.send('IF' + JSON.stringify(CodeFormatter.reformat(input)));
    } catch (err) {
      koru.unhandledException(err);
      ws.send('IF' + JSON.stringify({errors: [{reason: err.toString()}]}));
    }
  };
});
