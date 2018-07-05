define((require, exports, module)=>{
  /**
   * Make a subject that can be observered.
   **/
  const TH              = require('koru/test-helper');
  const api             = require('koru/test/api');

  const {stub, spy, onEnd} = TH;

  const makeSubject = require('./make-subject');

  let v = {};

  TH.testCase(module, ({beforeEach, afterEach, test, group})=>{
    afterEach(()=>{
      v = {};
    }),

    test("makeSubject", ()=>{
      /**
       * Make an object observable by adding observe and notify
       * methods to it.
       *
       * @param {object} subject the object observe

       * @param [observeName] method name to call to start observing
       * `subject` (defaults to OnChange)

       * @param [notifyName] method name to tell observers of a change
       * (defaults to notify)

       * @param {function} [allStopped] method will be called with subject when all observers have
       * stopped.

       * @returns {object} adorned {#koru/make-subject::subject} parameter
       **/
      const sut = makeSubject;
      {
        const makeSubject = api.custom(sut);
        //[
        const eg1 = {eg: 1};
        const subject = makeSubject(eg1);

        assert.same(subject, eg1);
        assert.isFunction(subject.onChange);
        assert.isFunction(subject.notify);

        const subject2 = makeSubject({eg: 2}, 'onUpdate', 'updated');

        assert.isFunction(subject2.onUpdate);
        assert.isFunction(subject2.updated);
        //]

        api.innerSubject(subject, 'subject', {
          abstract: `
created by calling {#koru/make-subject}.
`});

      }
    });

    test("onChange", ()=>{
      /**
       * OnChange starts observing a subject
       *
       * @param callback is function what will receive the arguments sent by `notify`
       **/
      const subject = makeSubject({eg: 1});

      const iapi = api.innerSubject(subject, 'subject', );
      iapi.method("onChange");
      subject.onChange(v.stub1 = stub("{observer 1}"));
      subject.notify(123, 'foo');

      assert.calledWith(v.stub1, 123, 'foo');

      //[// see notify for more examples//]
    });

    test("notify", ()=>{
      /**
       * notify all observers
       *
       * @param {...any-type} args arguments to send to observers
       **/
      //[
      const subject = makeSubject({eg: 1});
      //]
      const iapi = api.innerSubject(subject, 'subject');
      iapi.method("notify");

      //[
      subject.onChange(v.stub1 = stub("{observer 1}"));
      const handle = subject.onChange(v.stub2 = stub("{observer 2}"));
      const h2 = subject.onChange(v.stub3 = stub("{observer 3}"));
      handle.stop();

      subject.notify(123, 'foo');

      assert.calledWith(v.stub1, 123, 'foo');
      refute.called(v.stub2);
      assert.calledWith(v.stub3, 123);

      assert.same(v.stub3.firstCall.thisValue, h2);
      //]
    });

    test("allStopped", ()=>{
      const subject = makeSubject(
        {eg: 1}, 'onChange', 'notify', {allStopped: v.allStopped = stub()});

      const oc1 = subject.onChange(stub());
      const oc2 = subject.onChange(stub());
      oc1.stop();

      refute.called(v.allStopped);
      oc2.stop();
      assert.calledWith(v.allStopped, subject);
    });
  });
});
