define(function(require, exports, module) {
  var makeSubject = require('../make-subject');

  return function (model) {
    var observers = {};
    var modelObserver;
    var key = 0;
    var modelName = model.modelName;

    model.observeId = observeId;

    model.observeIds = observeIds;

    function observeId(id, callback) {
      var obs = observers[id] || (observers[id] = {});
      obs[++key] = callback;
      modelObserver || initModelObserver();
      return stopObserver(id, obs, key);
    };

    function stopObserver(id, obs, key) {
      return {
        stop: function() {
          delete obs[key];
          for(key in obs) return;
          delete observers[id];
          for(key in observers) return;
          modelObserver && modelObserver.stop();
          modelObserver = null;
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

    function initModelObserver() {
      modelObserver = model.onChange(function (doc, was) {
        var cbs = observers[(doc || was)._id];
        if (cbs) for(var i in cbs) {
          var cb = cbs[i];
          cb(doc, was);
        }
      });
    }
  };
});
