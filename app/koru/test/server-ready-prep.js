define((require, exports, module) => {
  'use strict';
  return (koru, BuildCmd) => {
    koru.onunload(module, () => {
      BuildCmd.serverReady?.();
    });
  };
});
