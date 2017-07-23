define(function(require, exports, module) {
  const makeSubject = require('../make-subject');
  const util        = require('../util');
  const dbBroker    = require('./db-broker');

  return model => {
    const {modelName} = model;

    model.registerObserveField = registerObserveField;

    function registerObserveField(field) {
      const dbObservers = Object.create(null);
      const modelObMap = Object.create(null);
      let key = 0;
      const fields = Object.create(null);
        fields[field] = 1;
      const findFieldOpts = {transform: null, fields};


      model['observe'+ util.capitalize(field)] = (values, callback) => {
        const obsSet = Object.create(null);
        const options = [++key, callback];
        if (values.constructor !== Array)
          throw new Error('values must be an array');

        for(let i = 0;i < values.length;++i) {
          const ob = observeValue(values[i], options);
          obsSet[ob.value]=ob;
        }

        return stopObservers(obsSet, options);
      };

      function observeValue(value, options) {
        const observers = dbObservers[dbBroker.dbId] || (dbObservers[dbBroker.dbId] = {});
        const obs = observers[value] || (observers[value] = Object.create(null));
        obs[options[0]] = options;
        const modelObserver = getModelOb(observers);
        return stopObserver(value, obs, options, observers);
      };

      function stopObserver(value, obs, options, observers) {
        return {
          stop() {
            delete obs[options[0]];
            for(let key in obs) return;
            delete observers[value];
            for(let key in observers) return;
            const modelObserver = modelObMap[dbBroker.dbId];
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
          stop() {
            for(let key in obsSet) obsSet[key].stop();
          },

          addValue(value) {
            value = value.toString();
            if (value in obsSet) return;
            obsSet[value] = observeValue(value, options);
          },

          removeValue(value) {
            value = value.toString();
            const ob = obsSet[value];
            if (! ob) return;

            ob.stop();
            delete obsSet[value];
          },

          replaceValues(newValues) {
            const delObs = obsSet;
            obsSet = {};
            const addValues = [];
            for(let i = 0; i < newValues.length; ++i) {
              var newValue = newValues[i].toString(); // only use strings for keys
              if (newValue in delObs) {
                obsSet[newValue] = delObs[newValue];
                delete delObs[newValue];
              } else {
                const rawValue = newValues[i];
                addValues.push(rawValue);
                obsSet[newValue] = observeValue(rawValue, options);
              }
            }
            for(let value in delObs) delObs[value].stop();
          },
        };
      }

      function getModelOb(observers) {
        const t = modelObMap[dbBroker.dbId];
        if (t) return t;

        const ob = model.onChange((doc, was) => {
          const nowValue = doc && doc[field];
          const asBefore = doc ? was && doc.$withChanges(was) : was;
          const oldValue = asBefore && asBefore[field];

          const called = {}; // ensure only called once;

          if (oldValue != undefined) {
            if (Array.isArray(oldValue)) for(let i = 0; i < oldValue.length; ++i) {
              callObservers(called, doc, was, oldValue[i]);
            } else {
              callObservers(called, doc, was, oldValue);
            }
          }

          if (nowValue != undefined && nowValue !== oldValue) {
            if (Array.isArray(nowValue)) for(let i = 0; i < nowValue.length; ++i) {
              callObservers(called, doc, was, nowValue[i]);
            } else {
              callObservers(called, doc, was, nowValue);
            }
          }
        });

        return modelObMap[dbBroker.dbId] = ob;

        function callObservers(called, doc, was, value) {
          const cbs = observers[value];
          if (cbs) for(let key in cbs) {
            const options = cbs[key];
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
