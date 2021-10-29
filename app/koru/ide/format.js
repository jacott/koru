define((require, exports, module) => {
  'use strict';
  const koru            = require('koru');
  const CodeFormatter   = require('koru/parse/code-formatter');

  const options = {ignoreSyntaxError: false};

  return (ws, _clients, input) => {
    try {
      ws.send('IF' + JSON.stringify({source: CodeFormatter.reformat(input, options)}));
    } catch(err) {
      if (err.name === 'SyntaxError') {
        koru.error(err.toString());
      } else {
        koru.unhandledException(err);
      }
      ws.send('IF' + JSON.stringify({source: input}));
    }
  };
});
