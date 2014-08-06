exports.common = function (cfg) {
  cfg.merge('requirejs.packages', [
    "koru/model", "koru/user-account",
  ]);
};

exports.client = function (cfg) {
};

exports.server = function (cfg) {
};
