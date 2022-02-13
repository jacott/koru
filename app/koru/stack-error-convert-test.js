isServer && define((require, exports, module) => {
  'use strict';
  const koru            = require('koru');
  const fst             = require('koru/fs-tools');
  const Mutex           = require('koru/mutex');
  const TH              = require('./test-helper');
  const fsp             = requirejs.nodeRequire('fs/promises');

  const {SourceMapGenerator, SourceMapConsumer} = requirejs.nodeRequire('source-map');

  const {stub, spy} = TH;

  const StackErrorConvert = require('./stack-error-convert');

  TH.testCase(module, ({before, after, beforeEach, afterEach, group, test}) => {
    afterEach(() => {
      StackErrorConvert.stop();
    });

    test('koru.clientErrorConvert', async () => {
      const map = new SourceMapGenerator({
        file: 'index.js',
        skipValidation: true,
      });

      map.addMapping({
        generated: {
          line: 1,
          column: 170040,
        },
        source: '/file1.js',
        original: {
          line: 13,
          column: 23,
        },
        name: 'christopher',
      });

      map.addMapping({
        generated: {
          line: 13,
          column: 20,
        },
        source: '/nested/file2.js',
        original: {
          line: 4,
          column: 1,
        },
        name: 'robin',
      });

      stub(fst, 'stat').invokes((c) => Promise.resolve(/index/.test(c.args[0]) ? {} : undefined));
      stub(fsp, 'readFile').withArgs('test/maps/index.js.map')
        .returns(Promise.resolve(Buffer.from(map.toString())));

      StackErrorConvert.start({
        sourceMapDir: 'test/maps',
        prefix: 'myPrefix',
        lineAdjust: -1,
      });

      const consumer = await new SourceMapConsumer(map.toString());
      consumer.destroy();

      const BasicSourceMapConsumer = consumer.constructor;

      const lock = spy(Mutex.prototype, 'lock');
      const unlock = spy(Mutex.prototype, 'unlock');
      const destroy = spy(BasicSourceMapConsumer.prototype, 'destroy');

      assert.equals(
        await koru.clientErrorConvert(`while rendering: TicketDialogHistory.Action
Cannot read property 'class' of undefined
    at - j.ne (index.js:2:170049)
    at nasty (index.js/../index.js:4:334)
    at missing (nofound.js:4:334)
    at j.toChildren (index.js?4d99f24827ef433ac3da163797519ed5:14:23)`),
        `while rendering: TicketDialogHistory.Action
Cannot read property 'class' of undefined
    at - j.ne christopher (myPrefix/file1.js:13:23)
    at nasty (index.js/../index.js:4:334)
    at missing (nofound.js:4:334)
    at j.toChildren robin (myPrefix/nested/file2.js:4:1)`,
      );

      assert.calledOnce(lock);
      assert.calledTwice(destroy);
      assert(lock.calledBefore(destroy));
      assert(unlock.firstCall.globalCount > destroy.lastCall.globalCount);

      StackErrorConvert.stop();
      StackErrorConvert.start({sourceMapDir: 'test/maps'});

      assert.equals(await koru.clientErrorConvert(
        `while rendering: TicketDialogHistory.Action
Cannot read property 'class' of undefined
    at - j.ne (index.js:1:170100)`,
      ), `while rendering: TicketDialogHistory.Action
Cannot read property 'class' of undefined
    at - j.ne christopher (file1.js:13:23)`);
    });
  });
});
