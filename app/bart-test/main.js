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

  var totalTimer = Date.now();
  var count = 0, skipCount = 0, errorCount = 0;
  var timer = 0;

  geddon.onEnd(function () {
    console.log('TEST ', errorCount);
  });

  geddon.onTestStart(function () {
    timer = Date.now();
  });

  geddon.onTestEnd(function (test) {
    var result= "<FIXME>: ";
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
                 " (" + (Date.now() - totalTimer) + " ms / " + (Date.now() - timer) + " ms)\n");
  });

  top.setTimeout(function () {
    geddon.start();
  }, 1);

  return geddon;
});
