/*global define */

define(['module', 'bart/util-base', 'bart/stacktrace'], function(module, util, stacktrace) {
  return util.extend(util, {
    extractError: function (ex) {
      return ex.toString() + "\n" + stacktrace(ex).join("\n");
    },
    stacktrace: stacktrace,
  });
});
