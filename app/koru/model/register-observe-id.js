define((require) => {
  'use strict';
  const Observable      = require('koru/observable');
  const util            = require('koru/util');
  const dbBroker        = require('./db-broker');

  return (model) => {
    const modelObMap = Object.create(null);
    const {modelName} = model;

    const initObservers = (dbId) => {
      const observers = util.createDictionary();
      return [
        observers,
        model.onChange((dc) => {
          const cbs = observers[dc.doc._id];
          if (cbs !== void 0) {
            return cbs.notify(dc);
          }
        }),
      ];
    };

    const observeId = (id, callback) => {
      const {dbId} = dbBroker;
      const observers = (modelObMap[dbId] ??= initObservers(dbId))[0];

      const obs = observers[id] ??= new Observable(() => {
        delete observers[id];
        for (const _ in observers) return;
        const modelObserver = modelObMap[dbId];
        if (modelObserver !== undefined) {
          modelObserver[1].stop();
          delete modelObMap[dbId];
        }
      });

      return obs.add(callback);
    };
    model.observeId = observeId;

    const observeIds = (ids, callback) =>
      stopObservers(ids.map((id) => observeId(id, callback)), callback);
    model.observeIds = observeIds;

    const stopObservers = (obs, callback) => ({
      stop: () => {
        for (let i = 0; i < obs.length; ++i) obs[i].stop();
      },

      replaceIds: (newIds) => {
        const set = Object.create(null);
        for (let i = 0; i < obs.length; ++i) {
          const ob = obs[i];
          set[ob.id] = ob;
        }

        obs = [];
        for (let i = 0; i < newIds.length; ++i) {
          const newId = newIds[i];
          if (newId in set) {
            obs.push(set[newId]);
            delete set[newId];
          } else {
            obs.push(observeId(newId, callback));
          }
        }
        for (const key in set) set[key].stop();
      },
    });
  };
});
