define(function(require, exports, module) {
  const makeSubject = require('../make-subject');
  const util        = require('../util');
  const dbBroker    = require('./db-broker');

  return function (model) {
    var modelName = model.modelName;

    model.registerObserveField = registerObserveField;

    function registerObserveField(field) {
      var dbObservers = Object.create(null);
      var modelObMap = Object.create(null);
      var key = 0;
      var findFieldOpts = (function () {
        var fields = Object.create(null);
        fields[field] = 1;
        return {transform: null, fields: fields};
      })();


      model['observe'+ util.capitalize(field)] = function (values, callback) {
        if (typeof values !== 'object') values = [values];

        var obsSet = Object.create(null);
        var options = [++key, callback];
        for(var i=0;i < values.length;++i) {
          var ob = observeValue(values[i], options);
          obsSet[ob.value]=ob;
        }

        return stopObservers(obsSet, options);
      };

      function observeValue(value, options) {
        var observers = dbObservers[dbBroker.dbId] || (dbObservers[dbBroker.dbId] = {});
        var obs = observers[value] || (observers[value] = Object.create(null));
        obs[options[0]] = options;
        var modelObserver = getModelOb(observers);
        return stopObserver(value, obs, options, observers);
      };

      function stopObserver(value, obs, options, observers) {
        return {
          stop: function() {
            delete obs[options[0]];
            for(var key in obs) return;
            delete observers[value];
            for(var key in observers) return;
          var modelObserver = modelObMap[dbBroker.dbId];
            if (modelObserver) {
              modelObserver.stop();
              delete modelObMap[dbBroker.dbId];
            }
          },

          value: value
        };
      }

      function stopObservers(obsSet, options) {
        return {
          stop: function() {
            for(var key in obsSet) {
              obsSet[key].stop();
            }
          },

          addValue: function (value) {
            value = value.toString();
            if (value in obsSet) return;

            var ob = observeValue(value, options);
            obsSet[value] = ob;
          },

          removeValue: function (value) {
            value = value.toString();
            var ob = obsSet[value];
            if (! ob) return;

            ob.stop();
            delete obsSet[value];
          },

          replaceValues: function (newValues) {
            var delObs = obsSet;
            obsSet = {};
            var addValues = [];
            for(var i=0;i < newValues.length;++i) {
              var newValue = newValues[i].toString(); // only use strings for keys
              if (newValue in delObs) {
                obsSet[newValue] = delObs[newValue];
                delete delObs[newValue];
              } else {
                var rawValue = newValues[i];
                addValues.push(rawValue);
                obsSet[newValue] = observeValue(rawValue, options);
              }
            }
            for(var value in delObs) {
              delObs[value].stop();
            }
          },
        };
      }

      function getModelOb(observers) {
        var ob = modelObMap[dbBroker.dbId];
        if (ob) return ob;

        ob = model.onChange(function (doc, was) {
          var nowValue = doc && doc[field];
          var asBefore = doc ? was && doc.$withChanges(was) : was;
          var oldValue = asBefore && asBefore[field];

          var called = {}; // ensure only called once;



          if (oldValue != undefined) {
            if (Array.isArray(oldValue)) for(var i = 0; i < oldValue.length; ++i) {
              callObservers(called, doc, was, oldValue[i]);
            } else {
              callObservers(called, doc, was, oldValue);
            }
          }

          if (nowValue != undefined && nowValue !== oldValue) {
            if (Array.isArray(nowValue)) for(var i = 0; i < nowValue.length; ++i) {
              callObservers(called, doc, was, nowValue[i]);
            } else {
              callObservers(called, doc, was, nowValue);
            }
          }
        });

        return modelObMap[dbBroker.dbId] = ob;

        function callObservers(called, doc, was, value) {
          var cbs = observers[value];
          if (cbs) for(var key in cbs) {
            var options = cbs[key];
            if (! (options[0] in called)) {
              called[options[0]] = true;
              options[1](doc, was);
            }
          }
        }
      }
    }
  };
});
