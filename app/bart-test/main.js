define(function(require, exports, module) {
  var core = require('bart/core');
  var session = require('bart/session');

  require("./assertions-methods");
  require("./callbacks");
  require("./test-case");
  require("./runner");
  var geddon = require("./core");

  core.onunload(module, 'reload');

  var top = window;

  top.assert = geddon.assert;
  top.refute = geddon.refute;

  var count, skipCount, errorCount, timer;

  geddon.onEnd(function () {
    session.send('TF', errorCount);
    geddon._init();
  });

  geddon.onTestStart(function (test) {
    timer = Date.now();
  });

  geddon.onTestEnd(function (test) {
    if (test.errors) {
      ++errorCount;

      var result= test.name + "\x00";
      var errors = test.errors;
      for(var i=0;i < errors.length; ++i) {
        result += errors[i]+"\n";
      }
      result += "\n";
      session.send('TE', result);
    }

    test.skipped ? ++skipCount : ++count;

    session.send('TR', test.name+ "\x00" + [count,geddon.testCount,errorCount,skipCount,Date.now() - timer].join(' '));
  });

  return {
    run: function () {
      count = skipCount = errorCount = 0;

      geddon.start();
    },

    testCase: function (module, option) {
      core.onunload(module, geddon.unloadTestcase);
      return geddon.testCase(module.id.replace(/-test$/, ''), option);
    },
  };
});
