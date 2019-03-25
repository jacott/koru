define((require)=>{
  'use strict';
  const Observable      = require('koru/observable');

  const makeSubject = (
    subject={}, observeName='onChange', notifyName='notify',
    {allStopped, init, stopAllName}={}
  )=>{
    const observable = new Observable(allStopped ? ()=>{allStopped(subject)} : undefined);


    if (stopAllName) subject[stopAllName] = () => {observable.stopAll()};

    if (subject[observeName] || subject[notifyName])
      throw new Error('Already a subject');

    subject[observeName] = callback => observable.add(callback);

    subject[notifyName] = (...args) => observable.notify(...args);

    return subject;
  };

  return makeSubject;
});
