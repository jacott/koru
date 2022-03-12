define((require) => {
  'use strict';
  const Observable      = require('koru/observable');
  const dbBroker        = require('./db-broker');
  const util            = require('../util');

  const token$ = Symbol();

  const {createDictionary} = util;

  return (model) => {
    const {modelName} = model;

    const asyncCallObservers = async (p, iter, called, docChange) => {
      await p;
      for (let i = iter.next(); ! i.done; i = iter.next()) {
        const handle = i.value;
        const token = handle[token$];
        if (! called.has(token)) {
          called.add(token);
          const p = handle.callback(docChange);
          if (isPromise(p)) await p;
        }
      }
    };

    const callObservers = (observers, called, docChange, value) => {
      const cbs = observers[value];
      if (cbs === void 0) return;
      const iter = cbs[Symbol.iterator]();
      for (let i = iter.next(); ! i.done; i = iter.next()) {
        const handle = i.value;
        const token = handle[token$];
        if (! called.has(token)) {
          called.add(token);
          const p = handle.callback(docChange);
          if (isPromise(p)) {
            return asyncCallObservers(p, iter, called, docChange);
          }
        }
      }
    };

    const asyncContinueValues = async (p, i, values, observers, called, dc) => {
      for (await p; i < values.length; ++i) {
        p = callObservers(observers, called, dc, values[i]);
        if (isPromise(p)) await p;
      }
    };

    const asyncCallNowValue = async (p, nowValue, oldValue, observers, called, dc) => {
      await p;
      if (nowValue !== void 0 && nowValue !== oldValue) {
        if (Array.isArray(nowValue)) {
          for (let i = 0; i < nowValue.length; ++i) {
            p = callObservers(observers, called, dc, nowValue[i]);
            if (isPromise(p)) await p;
          }
        } else {
          p = callObservers(observers, called, dc, nowValue);
          if (isPromise(p)) await p;
        }
      }
    };

    const ensureModelOb = (modelObMap, field, observers) => {
      const t = modelObMap[dbBroker.dbId];
      if (t) return t;

      const ob = model.onChange((dc) => {
        const asBefore = dc.was;
        const nowValue = dc.isDelete ? void 0 : dc.doc[field];
        const oldValue = asBefore === null ? void 0 : asBefore[field];

        const called = new Set(); // ensure only called once;

        let p;
        if (oldValue != void 0) {
          if (Array.isArray(oldValue)) {
            for (let i = 0; i < oldValue.length; ++i) {
              p = callObservers(observers, called, dc, oldValue[i]);
              if (isPromise(p)) {
                p = asyncContinueValues(p, i, oldValue, observers, called, dc);
                break;
              }
            }
          } else {
            p = callObservers(observers, called, dc, oldValue);
          }
        }

        if (isPromise(p)) {
          return asyncCallNowValue(p, nowValue, oldValue, observers, called, dc);
        }

        if (nowValue !== void 0 && nowValue !== oldValue) {
          if (Array.isArray(nowValue)) {
            for (let i = 0; i < nowValue.length; ++i) {
              p = callObservers(observers, called, dc, nowValue[i]);
              if (isPromise(p)) {
                return asyncContinueValues(p, i, nowValue, observers, called, dc);
              }
            }
          } else {
            return callObservers(observers, called, dc, nowValue);
          }
        }
      });

      modelObMap[dbBroker.dbId] = ob;
    };

    model.registerObserveField = (field) => {
      const dbObservers = Object.create(null);
      const modelObMap = Object.create(null);

      const observeValue = (value, callback, token) => {
        const observers = dbObservers[dbBroker.dbId] ?? (dbObservers[dbBroker.dbId] = {});
        const obs = observers[value] ?? (observers[value] = new Observable(() => {
          delete observers[value];
          for (const _ in observers) return;
          const modelObserver = modelObMap[dbBroker.dbId];
          if (modelObserver) {
            modelObserver.stop();
            delete modelObMap[dbBroker.dbId];
          }
        }));

        ensureModelOb(modelObMap, field, observers);
        const handle = obs.add(callback);
        handle[token$] = token;
        handle.value = value;
        return handle;
      };

      const stopObservers = (obsSet, callback, token) => {
        return {
          stop: () => {
            for (const key in obsSet) obsSet[key].stop();
          },

          addValue: (value) => {
            const str = '' + value;
            if (str in obsSet) return;
            obsSet[value] = observeValue(str, callback, token);
          },

          removeValue: (value) => {
            const str = '' + value;
            const ob = obsSet[value];
            if (ob === void 0) return;

            ob.stop();
            delete obsSet[value];
          },

          replaceValues: (newValues) => {
            const delObs = obsSet;
            obsSet = createDictionary();
            for (let i = 0; i < newValues.length; ++i) {
              const newValue = '' + newValues[i]; // only use strings for keys
              if (newValue in delObs) {
                obsSet[newValue] = delObs[newValue];
                delete delObs[newValue];
              } else {
                obsSet[newValue] = observeValue(newValue, callback, token);
              }
            }
            for (const value in delObs) delObs[value].stop();
          },
        };
      };

      model['observe' + util.capitalize(field)] = (values, callback) => {
        const obsSet = createDictionary();
        if (values.constructor !== Array) {
          throw new Error('values must be an array');
        }

        const token = Symbol();

        for (let i = 0; i < values.length; ++i) {
          const ob = observeValue(values[i], callback, token);
          obsSet[ob.value] = ob;
        }

        return stopObservers(obsSet, callback, token);
      };
    };
  };
});
