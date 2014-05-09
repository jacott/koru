var fs = require('fs');

define([], function() {

  return {
    oneClient: function (pattern) {
      var idx = pattern.indexOf(' ');
      var testFn = (idx === -1 ? pattern : pattern.slice(0, idx))+'-test';

      var cmdFn = requirejs.toUrl('../tmp/client-cmd.js');
      fs.writeFileSync(cmdFn,
                       "define(['bart-test','" + testFn + "'],function(bt){bt.run("+
                       JSON.stringify(pattern)+
                       ")})");
      fs.renameSync(cmdFn, requirejs.toUrl('client-cmd.js'));
    },
  };
});
