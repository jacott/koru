define(function(require, exports, module) {
  var TH = require('../test-helper');
  var env = require('../env');
  var Route = require('./route');

  env.onunload(module, function () {
    Route.history = TH._orig_history;
  });

  Route._orig_history = Route.history;
  Route.history = {
    pushState: function () {},
    replaceState: function () {},
    back: function () {},
  };


  // TH.util.extend(TH, {
  // });

  return TH;
});
