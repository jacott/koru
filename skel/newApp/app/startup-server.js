define((require, exports, module)=>{
  const koru            = require('koru');

  const restart = (mod, error)=>{
    if (error) return;
    koru.setTimeout(() => require(module.id, start => start()));
  };

  koru.onunload(module, restart);

  return ()=>{
  };
});
