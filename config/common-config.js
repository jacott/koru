exports.common = function (cfg) {
  cfg.merge('requirejs.packages', [
    "koru/model", "koru/user-account",
  ]);
  cfg.set('requirejs.enforceAcyclic', true);
};

exports.client = function (cfg) {
};

exports.server = function (cfg) {
};
