exports.common = cfg =>{
  cfg.merge('requirejs.packages', [
    "koru/model", "koru/user-account",
  ]);
  cfg.set('requirejs.enforceAcyclic', true);
};

exports.client = cfg =>{};

exports.server = cfg =>{};
