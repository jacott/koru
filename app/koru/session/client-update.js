define((require)=>{
  const dbBroker        = require('koru/model/db-broker');
  const koru            = require('../main');
  const Model           = require('../model/main');
  const ModelEnv        = require('../model/main-client');
  const Query           = require('../model/query');
  const Trace           = require('../trace');
  const util            = require('../util');
  const message         = require('./message');
  const publish         = require('./publish');

  let debug_clientUpdate = false;
  Trace.debug_clientUpdate = value => {debug_clientUpdate = value};

  const modelUpdate = (type, func) => {
    return function (data) {
      const session = this;
      if (debug_clientUpdate) {
        if (debug_clientUpdate === true || debug_clientUpdate[data[0]])
          koru.logger("D", type, '< ' + util.inspect(data));
      }
      session.isUpdateFromServer = true;
      try {
        dbBroker.pushDbId(session._id);
        func(Model[data[0]], data[1], data[2]);
      } finally {
        session.isUpdateFromServer = false;
        dbBroker.popDbId();
      }
    };
  };

  const added = modelUpdate('Add', (model, id, attrs) => {
    attrs._id = id;
    const doc = new model(attrs);
    publish.match.has(doc) && Query.insertFromServer(model, id, attrs);
  });

  const changed = modelUpdate('Upd', (model, id, attrs) => {
    attrs._id = id;
    const query = model.serverQuery.onId(id);
    const doc = model.findById(id);
    if (doc && publish.match.has(doc)) {
      doc.$clearCache();
      query.update(attrs);
    } else
      query.remove();
  });

  const removed = modelUpdate('Rem', (model, id) => {
    model.serverQuery.onId(id).remove();
  });

  return session => {
    session.provide('A', added);
    session.provide('C', changed);
    session.provide('R', removed);

    return {
      unload: ()=>{
        session.unprovide('A');
        session.unprovide('C');
        session.unprovide('R');
      },
    };
  };
});
