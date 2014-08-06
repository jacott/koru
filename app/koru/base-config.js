exports.common = function (cfg) {
  cfg.set('requirejs.packages', [
    "koru", "koru/session",
  ]);
};

exports.server = function (cfg) {
  cfg.merge('requirejs', {
    paths: {
      koru: __dirname
    },
    //Pass the top-level main.js/index.js require
    //function to requirejs so that node modules
    //are loaded relative to the top-level JS file.
    nodeRequire: require
  });
  cfg.set('startup', 'server');
  cfg.set('clientjs', 'client');
};

exports.client = function (cfg) {

};
