const path = require('path');

define((require, exports, module)=>{
  const koru            = require('koru');
  const fileWatch       = require('koru/file-watch');
  const Model           = require('koru/model');
  const TH              = require('koru/model/test-db-helper');
  const test            = require('koru/test/server');
  const stubber         = require('koru/test/stubber');
  const webServer       = require('koru/web-server');

  TH.Core.onStart(()=>{TH.startTransaction()});
  TH.Core.onEnd(()=>{TH.rollbackTransaction()});

  require('koru/server');
  require('koru/server-rc');

  return ()=>{
    stubber.spy(Model.BaseModel, 'addUniqueIndex');
    stubber.spy(Model.BaseModel, 'addIndex');

    fileWatch.watch(path.join(koru.libDir, 'app/koru'), path.join(koru.libDir, 'app'));

    webServer.start();
    console.log('=> Ready');
  };
});
