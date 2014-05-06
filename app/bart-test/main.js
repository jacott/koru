define(function(require) {
  var session = require('bart-session');
  require("./assertions-methods");
  require("./callbacks");
  require("./test-case");
  require("./runner");
  var geddon = require("./core");

  var top = window;

  top.assert = geddon.assert;
  top.refute = geddon.refute;

  var count, skipCount, errorCount, timer;

  geddon.onEnd(function () {
    session.send('T<FIXME> FINISHED: ', errorCount ? 'FAILED' : 'PASSED');

    geddon._init();
  });

  geddon.onTestStart(function (test) {
    timer = Date.now();
  });

  geddon.onTestEnd(function (test) {
    var result= "<FIXME>: <" + test.name + "> ";
    if (test.errors) {
      result += test.name + ' FAILED\n';
      ++errorCount;
      var errors = test.errors;
      for(var i=0;i < errors.length; ++i) {
        result += errors[i]+"\n";
      }
      result += "\n: ";
    }

    test.skipped ? ++skipCount : ++count;
    var extraMsg = skipCount === 0 ? "" : " (skipped "+skipCount+")";

    if (errorCount === 0)
      extraMsg += " SUCCESS";
    else
      extraMsg += " (" + errorCount + " FAILED)";

    session.send('T', result + "Executed " + count + " of " + geddon.testCount  + extraMsg +
                 " (" + (Date.now() - timer) + " ms)\n");
  });

  return {
    run: function () {
      count = skipCount = errorCount = 0;

      geddon.start();
    },

    testCase: function () {
      return geddon.testCase.apply(geddon, arguments);
    },
  };
});
