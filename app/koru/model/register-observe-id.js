define(function(require, exports, module) {
  var util = require('koru/util');
  var makeSubject = require('koru/make-subject');

  return function (model) {
    const dbObservers = {};
    const modelObMap = {};
    const modelName = model.modelName;
    var key = 0;

    model.observeId = observeId;

    model.observeIds = observeIds;

    function observeId(id, callback) {
      var observers = dbObservers[util.dbId] || (dbObservers[util.dbId] = {});

      var obs = observers[id] || (observers[id] = {});
      obs[++key] = callback;

      observeModel(observers);
      return stopObserver(id, obs, key, observers);
    };

    function stopObserver(id, obs, key, observers) {
      return {
        stop: function() {
          delete obs[key];
          for(key in obs) return;
          delete observers[id];
          for(id in observers) return;
          var modelObserver = modelObMap[util.dbId];
          if (modelObserver) {
            modelObserver.stop();
            delete modelObMap[util.dbId];
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

        replaceIds: function (newIds) {
          var set = {};
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
      if (modelObMap[util.dbId]) return;

      modelObMap[util.dbId] = model.onChange(function (doc, was) {
        var cbs = observers[(doc || was)._id];
        if (cbs) for(var i in cbs) {
          var cb = cbs[i];
          cb(doc, was);
        }
      });
    }
  };
});
