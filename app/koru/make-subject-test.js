define(function (require, exports, module) {
  /**
   * Make a subject that can be observered.
   **/
  const api    = require('koru/test/api');
  const geddon = require('./test');

  const sut = require('./make-subject');
  var v;

  geddon.testCase(module, {
    setUp() {
      v = {};
      api.module();
    },

    tearDown() {
      v = null;
    },

    "test makeSubject"() {
      /**
       * Make an object observable by adding observe and notify
       * methods to it.
       *
       * @param subject the object observe

       * @param [observeName] method name to call to start observing
       * `subject` (defaults to OnChange)

       * @param [notifyName] method name to tell observers of a change
       * (defaults to notify)
       **/
      const makeSubject = api.custom(sut);
      const subject = makeSubject({eg: 1});
      assert.isFunction(subject.onChange);
      assert.isFunction(subject.notify);

      const subject2 = makeSubject({eg: 2}, 'onUpdate', 'updated');
      assert.isFunction(subject2.onUpdate);
      assert.isFunction(subject2.updated);
    },

    "test onChange"() {
      /**
       * OnChange starts observing a subject
       *
       * @param callback is function what will receive the arguments sent by `notify`
       **/
      const subject = sut({eg: 1});

      const iapi = api.innerSubject(subject, 'makeSubject()');
      iapi.method("onChange");
      subject.onChange(v.stub1 = this.stub("{observer 1}"));
      subject.notify(123, 'foo');

      assert.calledWith(v.stub1, 123, 'foo');

      iapi.example("// see notify for more examples");
    },

    "test notify"() {
      /**
       * notify all observers
       *
       * @param {...any-type} args arguments to send to observers
       **/
      const subject = sut({eg: 1});

      const iapi = api.innerSubject(subject, 'makeSubject()');
      iapi.method("notify");
      iapi.example("const subject = makeSubject({});\n");
      iapi.exampleCont(() => {
        subject.onChange(v.stub1 = this.stub("{observer 1}"));
        const handle = subject.onChange(v.stub2 = this.stub("{observer 2}"));
        const h2 = subject.onChange(v.stub3 = this.stub("{observer 3}"));
        handle.stop();

        subject.notify(123, 'foo');

        assert.calledWith(v.stub1, 123, 'foo');
        refute.called(v.stub2);
        assert.calledWith(v.stub3, 123);

        assert.same(v.stub3.firstCall.thisValue, h2);
      });
    },
  });
});
