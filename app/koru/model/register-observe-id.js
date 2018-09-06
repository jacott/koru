define((require)=>{
  const Observable      = require('koru/observable');
  const dbBroker        = require('./db-broker');

  return model=>{
    const dbObservers = Object.create(null);
    const modelObMap = Object.create(null);
    const {modelName} = model;

    const observeId = (id, callback)=>{
      const {dbId} = dbBroker;
      const observers = dbObservers[dbId] || (dbObservers[dbId] = {});

      const obs = observers[id] || (observers[id] = new Observable(()=>{
        delete observers[id];
        for(const _ in observers) return;
        const modelObserver = modelObMap[dbId];
        if (modelObserver) {
          modelObserver.stop();
          delete modelObMap[dbId];
        }
      }));
      observeModel(observers);
      return obs.add(callback);
    };
    model.observeId = observeId;

    const observeIds = (ids, callback)=> stopObservers(
      ids.map(id => observeId(id, callback)), callback);
    model.observeIds = observeIds;

    const stopObservers = (obs, callback)=>({
      stop: ()=>{for(let i = 0; i < obs.length; ++i) obs[i].stop()},

      replaceIds: newIds =>{
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
    });

    const observeModel = (observers)=>{
      if (modelObMap[dbBroker.dbId] === undefined)
        modelObMap[dbBroker.dbId] = model.onChange((doc, undo) => {
          const cbs = observers[(doc == null ? undo : doc)._id];
          cbs === undefined || cbs.notify(doc, undo);
        });
    };
  };
});
