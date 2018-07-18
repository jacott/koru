define((require)=>{
  const makeSubject = require('koru/make-subject');
  const dbBroker    = require('./db-broker');

  return model=>{
    const dbObservers = Object.create(null);
    const modelObMap = Object.create(null);
    const modelName = model.modelName;
    let key = 0;

    const observeId = (id, callback)=>{
      const {dbId} = dbBroker;
      const observers = dbObservers[dbId] || (dbObservers[dbId] = {});

      const obs = observers[id] || (observers[id] = Object.create(null));
      obs[++key] = callback;

      observeModel(observers);
      return stopObserver(id, obs, key, dbId, observers);
    };
    model.observeId = observeId;

    const stopObserver = (id, obs, key, dbId, observers)=>{
      return {
        stop() {
          delete obs[key];
          for(const _ in obs) return;
          delete observers[id];
          for(const _ in observers) return;
          const modelObserver = modelObMap[dbId];
          if (modelObserver) {
            modelObserver.stop();
            delete modelObMap[dbId];
          }
        },

        id,
      };
    };

    const observeIds = (ids, callback)=> stopObservers(
      ids.map(id => observeId(id, callback)), callback);
    model.observeIds = observeIds;

    const stopObservers = (obs, callback)=>{
      return {
        stop() {for(let i = 0; i < obs.length; ++i) obs[i].stop()},

        replaceIds(newIds) {
          const set = Object.create(null);
          for(let i = 0; i < obs.length; ++i) {
            const ob = obs[i];
            set[ob.id]=ob;
          }

          obs = [];
          for(let i = 0; i < newIds.length; ++i) {
            const newId = newIds[i];
            if (newId in set) {
              obs.push(set[newId]);
              delete set[newId];
            } else {
              obs.push(observeId(newId, callback));
            }
          }
          for(const key in set) set[key].stop();
        },
      };
    };

    const observeModel = (observers)=>{
      if (modelObMap[dbBroker.dbId]) return;

      modelObMap[dbBroker.dbId] = model.onChange((doc, undo) => {
        const cbs = observers[(doc == null ? undo : doc)._id];
        if (cbs) for(const i in cbs) {
          const cb = cbs[i];
          cb(doc, undo);
        }
      });
    };
  };
});
