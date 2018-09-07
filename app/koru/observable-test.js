define((require, exports, module)=>{
  /**
   * An observeable object. Observable keeps track of subjects and notifies all of them if asked.
   * An Observable instance is iteratable.
   *
   * See also {#koru/make-subject}
   **/
  const TH              = require('koru/test-helper');
  const api             = require('koru/test/api');

  const {stub, spy, onEnd, match: m} = TH;

  const Observable = require('./observable');

  TH.testCase(module, ({beforeEach, afterEach, test, group})=>{
    test("new", ()=>{
      /**
       * Make an instance of Observable
       *
       * @param {function} [allStopped] method will be called when all observers have stopped.

       **/
      const new_Observable = api.new();
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

    test("add", ()=>{
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
      assert.calledWith(observer1, 123, 'abc');

      handle1.stop();

      subject.notify('call2');

      refute.calledWith(observer1, 'call2');
      assert.calledWith(observer2, 'call2');
      //]
    });

    test("notify", ()=>{
      /**
       * Notify all observers
       *
       * @param {...any-type} args arguments to send to observers (see {##add})
       *
       * @returns {any-type} the first argument
       **/
       api.protoMethod();
      //[
      const subject = new Observable();

      const observer1 = stub(), observer2 = stub();
      subject.add(observer1);
      subject.add(observer2);

      assert.same(
        subject.notify(123, 'abc'),
        123
      );

      assert.calledWith(observer1, 123, 'abc');
      assert.calledWith(observer2, 123, 'abc');
      //]
    });

    test("forEach", ()=>{
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
        m.is(subject.add(observer2))
      ];

      const ans = [];

      subject.forEach(h => {ans.push(h)});

      assert.equals(ans, exp);
      //]
    });

    test("Symbol.iterator", ()=>{
      const subject = new Observable();

      const f2 = ()=>{};
      const exp = [
        m.is(subject.add(()=>{})),
        m.is(subject.add(f2)),
      ];
      subject.add(()=>{});

      const ans = [];

      for (const h of subject) {
        ans.push(h);
        if (h.callback === f2) break;
      }

      assert.equals(ans, exp);
    });

    test("stopAll", ()=>{
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
