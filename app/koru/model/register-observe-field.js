define(function(require, exports, module) {
  var makeSubject = require('../make-subject');
  var util = require('../util');

  return function (model) {
    var modelName = model.modelName;

    model.registerObserveField = registerObserveField;

    function registerObserveField(field) {
      var observers = {};
      var modelObserver;
      var key = 0;
      var findFieldOpts = (function () {
        var fields = {};
        fields[field] = 1;
        return {transform: null, fields: fields};
      })();


      model['observe'+ util.capitalize(field)] = function (values, callback) {
        if (typeof values !== 'object') values = [values];

        var obsSet = {};
        var options = [++key, callback];
        for(var i=0;i < values.length;++i) {
          var ob = observeValue(values[i], options);
          obsSet[ob.value]=ob;
        }

        return stopObservers(obsSet, options);
      };

      function observeValue(value, options) {
        var obs = observers[value] || (observers[value] = {});
        obs[options[0]] = options;
        modelObserver || initModelObserver();
        return stopObserver(value, obs, options);
      };

      function stopObserver(value, obs, options) {
        return {
          stop: function() {
            delete obs[options[0]];
            for(var key in obs) return;
            delete observers[value];
            for(var key in observers) return;
            modelObserver && modelObserver.stop();
            modelObserver = null;
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

      function initModelObserver() {
        modelObserver = model.onChange(function (doc, was) {
          var nowValue = doc && doc[field];
          var oldValue = doc ?
                was && ((field in was) ? was[field] : nowValue) :
              was[field];

          var called = {}; // ensure only called once;

          if (oldValue != undefined) {
            if (util.isArray(oldValue)) for(var i = 0; i < oldValue.length; ++i) {
              callObservers(called, doc, was, oldValue[i]);
            } else {
              callObservers(called, doc, was, oldValue);
            }
          }

          if (nowValue != undefined && nowValue !== oldValue) {
            if (util.isArray(nowValue)) for(var i = 0; i < nowValue.length; ++i) {
              callObservers(called, doc, was, nowValue[i]);
            } else {
              callObservers(called, doc, was, nowValue);
            }
          }
        });
      }

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
  };
});
