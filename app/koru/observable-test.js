define((require, exports, module) => {
  'use strict';
  /**
   * An observeable object. Observable keeps track of subjects and notifies all of them if asked.
   * An Observable instance is iteratable.
   *
   * See also {#koru/make-subject}
   **/
  const TH              = require('koru/test-helper');
  const api             = require('koru/test/api');

  const {stub, spy, match: m} = TH;

  const Observable = require('./observable');

  TH.testCase(module, ({beforeEach, afterEach, test, group}) => {
    test('constructor', () => {
      /**
       * Make an instance of Observable
       *
       * @param {function} [allStopped] method will be called when all observers have stopped.

       **/
      const Observable = api.class();
      //[
      const allStopped = stub();
      const subject = new Observable(allStopped);

      const observer1 = stub(), observer2 = stub();
      const handle1 = subject.add(observer1);
      const handle2 = subject.add(observer2);

      handle1.stop();

      refute.called(allStopped);
      handle2.stop();
      assert.called(allStopped);
      //]
      const subject2 = new Observable();
      const handle3 = subject2.add(observer1);
      handle3.stop();
    });

    test('add', () => {
      /**
       * add an observer a subject
       * @alias onChange
       *
       * @param {function} callback called with the arguments sent by `notify`
       *
       * @returns a handle that has the methods
       * * `callback` the function passed to `add`

       * * `stop` a function to stop observing -- stop can be called without a `this`

       **/
      api.protoMethod();
      //[
      const subject = new Observable();

      const observer1 = stub(), observer2 = stub();
      const handle1 = subject.add(observer1);
      const handle2 = subject.add(observer2);

      assert.same(handle1.callback, observer1);

      subject.notify(123, 'abc'),

      assert.calledWith(observer1, 123, 'abc');
      assert.calledWith(observer2, 123, 'abc');

      handle1.stop();

      subject.notify('call2');

      refute.calledWith(observer1, 'call2');
      assert.calledWith(observer2, 'call2');
      //]
    });

    test('notify', () => {
      /**
       * Notify all observers. Observers are notified in order they were added; first added, first
       * notified. If any of the observers return a promise then notify will wait for it to resolve
       * before calling the next observer and will return a promise that will resolve once all
       * observers have completed their callbacks.
       *
       * @param {...any-type} args arguments to send to observers (see {##add})
       *
       * @returns {any-type} the first argument. Wrapped in a promise if any observers are async.
       **/
      api.protoMethod();
      //[
      const subject = new Observable();

      const observer1 = stub(), observer2 = stub();
      subject.add(observer1);
      subject.add(observer2);

      assert.same(
        subject.notify(123, 'abc'),
        123,
      );

      assert.calledWith(observer1, 123, 'abc');
      assert.calledWith(observer2, 123, 'abc');

      assert(observer1.calledBefore(observer2));
      //]
    });

    test('async notify', async () => {
      api.protoMethod('notify');
      //[
      const subject = new Observable();

      const stub1 = stub(), stub2 = stub();
      subject.add(async (a, b) => {await 1; stub1(a, b)});
      subject.add(async (a, b) => {stub2(a, b); await 2});

      const ans = subject.notify(123, 'abc');

      refute.called(stub1);

      assert(ans instanceof Promise);

      assert.same(
        await ans,
        123,
      );

      assert.calledWith(stub1, 123, 'abc');
      assert.calledWith(stub2, 123, 'abc');

      assert(stub1.calledBefore(stub2));
      //]
    });

    test('forEach', () => {
      /**
       * visit each observer
       *
       * @param {function} visitor called for each observer with the `handle` (returned from
       * {##add}) as the argument.
       *
       **/
      api.protoMethod();
      //[
      const subject = new Observable();

      const observer1 = stub(), observer2 = stub();
      const exp = [
        m.is(subject.add(observer1)),
        m.is(subject.add(observer2)),
      ];

      const ans = [];

      subject.forEach((h) => {ans.push(h)});

      assert.equals(ans, exp);
      //]
    });

    test('Symbol.iterator', () => {
      const subject = new Observable();

      const f2 = () => {};
      const exp = [
        m.is(subject.add(() => {})),
        m.is(subject.add(f2)),
      ];
      subject.add(() => {});

      const ans = [];

      for (const h of subject) {
        ans.push(h);
        if (h.callback === f2) break;
      }

      assert.equals(ans, exp);
    });

    test('stopAll', () => {
      /**
       * Stop all observers
       **/
      api.protoMethod();
      //[
      const subject = new Observable();

      const observer1 = stub(), observer2 = stub();
      subject.add(observer1);
      subject.add(observer2);

      subject.stopAll();

      subject.notify(123, 'abc');

      refute.called(observer1);
      refute.called(observer2);
      //]
    });
  });
});
