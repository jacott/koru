const path = require('path');

define(function(require, exports, module) {
  const koru      = require('koru');
  const fileWatch = require('koru/file-watch');
  const Model     = require('koru/model');
  const test      = require('koru/test/server');
  const stubber   = require('koru/test/stubber');
  const webServer = require('koru/web-server');

  require('koru/server');
  require('koru/server-rc');

  return function () {
    stubber.spy(Model.BaseModel, 'addUniqueIndex');
    stubber.spy(Model.BaseModel, 'addIndex');

    fileWatch.watch(path.join(koru.libDir, 'app/koru'), path.join(koru.libDir, 'app'));

    webServer.start();
    console.log('=> Ready');
  };
});
