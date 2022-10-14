define((require, exports, module) => {
  'use strict';
  const fs              = requirejs.nodeRequire('fs');

  const Actions = {};

  return {
    handle: (cmd, ws, clients, data) => {
      let action = Actions[cmd];
      if (action === undefined) {
        const id = module.normalizeId('./' + cmd);
        action = require(id);
        const mod = module.get(id);
        mod.onUnload(() => {Actions[cmd] = undefined});
        Actions[cmd] = action;
      }
      action(ws, clients, data);
    },
  };
});
