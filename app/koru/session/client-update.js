define((require)=>{
  const koru            = require('koru');
  const Model           = require('koru/model');
  const dbBroker        = require('koru/model/db-broker');
  const Query           = require('koru/model/query');
  const Trace           = require('koru/trace');
  const util            = require('koru/util');

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
      const prevDbId = dbBroker.dbId;
      try {
        dbBroker.dbId = session._id;
        func(Model[data[0]], data[1], data[2]);
      } finally {
        session.isUpdateFromServer = false;
        dbBroker.dbId = prevDbId;
      }
    };
  };

  const added = modelUpdate('Add', (model, attrs) => {
    Query.insertFromServer(model, attrs);
  });

  const changed = modelUpdate('Upd', (model, id, attrs) => {
    model.serverQuery.onId(id).update(attrs);
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
