define(function(require, exports, module) {
  const makeSubject = require('koru/make-subject');
  const dbBroker    = require('./db-broker');

  return function (model) {
    const dbObservers = Object.create(null);
    const modelObMap = Object.create(null);
    const modelName = model.modelName;
    var key = 0;

    model.observeId = observeId;

    model.observeIds = observeIds;

    function observeId(id, callback) {
      var dbId = dbBroker.dbId;
      var observers = dbObservers[dbId] || (dbObservers[dbId] = {});

      var obs = observers[id] || (observers[id] = Object.create(null));
      obs[++key] = callback;

      observeModel(observers);
      return stopObserver(id, obs, key, dbId, observers);
    };

    function stopObserver(id, obs, key, dbId, observers) {
      return {
        stop: function() {
          delete obs[key];
          for(key in obs) return;
          delete observers[id];
          for(id in observers) return;
          var modelObserver = modelObMap[dbId];
          if (modelObserver) {
            modelObserver.stop();
            delete modelObMap[dbId];
          }
        },

        id: id
      };
    }

    function observeIds(ids, callback) {
      return stopObservers(ids.map(function (id) {
        return observeId(id, callback);
      }), callback);
    }

    function stopObservers(obs, callback) {
      return {
        stop: function() {
          for(var i = 0; i < obs.length; ++i) {
            obs[i].stop();
          }
        },

        replaceIds(newIds) {
          var set = Object.create(null);
          for(var i=0;i < obs.length;++i) {
            var ob = obs[i];
            set[ob.id]=ob;
          }

          obs = [];
          for(var i=0;i < newIds.length;++i) {
            var newId = newIds[i];
            if (newId in set) {
              obs.push(set[newId]);
              delete set[newId];
            } else {
              obs.push(observeId(newId, callback));
            }
          }
          for(var key in set) {
            set[key].stop();
          }
        },
      };
    }

    function observeModel(observers) {
      if (modelObMap[dbBroker.dbId]) return;

      modelObMap[dbBroker.dbId] = model.onChange(function (doc, was) {
        var cbs = observers[(doc || was)._id];
        if (cbs) for(var i in cbs) {
          var cb = cbs[i];
          cb(doc, was);
        }
      });
    }
  };
});
