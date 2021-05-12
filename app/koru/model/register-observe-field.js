define((require)=>{
  'use strict';
  const Observable      = require('koru/observable');
  const util            = require('../util');
  const dbBroker        = require('./db-broker');

  const token$ = Symbol();

  const {createDictionary} = util;

  return model => {
    const {modelName} = model;

    const callObservers = (observers, called, docChange, value)=>{
      const cbs = observers[value];
      if (cbs === void 0) return;
      cbs.forEach(handle =>{
        const token = handle[token$];
        if (! called.has(token)) {
          called.add(token);
          handle.callback(docChange);
        }
      });
    };

    const ensureModelOb = (modelObMap, field, observers)=>{
      const t = modelObMap[dbBroker.dbId];
      if (t) return t;

      const ob = model.onChange(dc =>{
        const asBefore = dc.was;
        const nowValue = dc.isDelete ? void 0 : dc.doc[field];
        const oldValue = asBefore === null ? void 0 : asBefore[field];

        const called = new Set; // ensure only called once;

        if (oldValue != void 0) {
          if (Array.isArray(oldValue)) for(let i = 0; i < oldValue.length; ++i) {
            callObservers(observers, called, dc, oldValue[i]);
          } else {
            callObservers(observers, called, dc, oldValue);
          }
        }

        if (nowValue !== void 0 && nowValue !== oldValue) {
          if (Array.isArray(nowValue)) for(let i = 0; i < nowValue.length; ++i) {
            callObservers(observers, called, dc, nowValue[i]);
          } else {
            callObservers(observers, called, dc, nowValue);
          }
        }
      });

      modelObMap[dbBroker.dbId] = ob;
    };

    model.registerObserveField = field=>{
      const dbObservers = Object.create(null);
      const modelObMap = Object.create(null);

      const observeValue = (value, callback, token)=>{
        const observers = dbObservers[dbBroker.dbId] ?? (dbObservers[dbBroker.dbId] = {});
        const obs = observers[value] ?? (observers[value] = new Observable(()=>{
          delete observers[value];
          for(const _ in observers) return;
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

      const stopObservers = (obsSet, callback, token)=>{
        return {
          stop: ()=>{
            for(const key in obsSet) obsSet[key].stop();
          },

          addValue: (value)=>{
            const str = ''+value;
            if (str in obsSet) return;
            obsSet[value] = observeValue(str, callback, token);
          },

          removeValue: (value)=>{
            const str = ''+value;
            const ob = obsSet[value];
            if (ob === void 0) return;

            ob.stop();
            delete obsSet[value];
          },

          replaceValues: (newValues)=>{
            const delObs = obsSet;
            obsSet = createDictionary();
            for(let i = 0; i < newValues.length; ++i) {
              const newValue = ''+newValues[i]; // only use strings for keys
              if (newValue in delObs) {
                obsSet[newValue] = delObs[newValue];
                delete delObs[newValue];
              } else {
                obsSet[newValue] = observeValue(newValue, callback, token);
              }
            }
            for(const value in delObs) delObs[value].stop();
          },
        };
      };

      model['observe'+ util.capitalize(field)] = (values, callback) => {
        const obsSet = createDictionary();
        if (values.constructor !== Array)
          throw new Error('values must be an array');

        const token = Symbol();

        for(let i = 0;i < values.length;++i) {
          const ob = observeValue(values[i], callback, token);
          obsSet[ob.value]=ob;
        }

        return stopObservers(obsSet, callback, token);
      };
    };
  };
});
