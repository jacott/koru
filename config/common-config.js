exports.common = function (cfg) {
  cfg.merge('requirejs.packages', [
    "koru/model", "koru/user-account",
  ]);
  cfg.set('requirejs.ensureAcyclic', true);
};

exports.client = function (cfg) {
};

exports.server = function (cfg) {
};
