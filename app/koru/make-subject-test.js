define((require, exports, module)=>{
  /**
   * Make an object observable
   *
   * See also {#koru/observable}
   **/
  const TH              = require('koru/test-helper');
  const api             = require('koru/test/api');

  const {stub, spy, onEnd} = TH;

  const makeSubject = require('./make-subject');

  TH.testCase(module, ({beforeEach, afterEach, test, group})=>{
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
      }
    });
  });
});
