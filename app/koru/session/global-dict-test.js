isServer && define((require, exports, module) => {
  'use strict';
  const TH              = require('koru/model/test-db-helper');
  const message         = require('koru/session/message');
  const api             = require('koru/test/api');

  const {stub, spy, util} = TH;

  const GlobalDict = require('./global-dict');

  const Module = module.constructor;

  TH.testCase(module, ({before, after, beforeEach, afterEach, group, test}) => {
    beforeEach(() => TH.startTransaction());
    afterEach(() => TH.rollbackTransaction());

    test('constructor', () => {
      /**
       * Create a Global Dictionary.
       */
      const GlobalDict = api.class();
      //[
      const dict = new GlobalDict();
      //]
      assert.equals(dict.globalDictEncoded(), Buffer.from([0xff]));
    });

    test('main', () => {
      /**
       * Reference to the main GlobalDict used by koru
       */
      api.method();
      //[
      assert.isTrue(GlobalDict.main instanceof GlobalDict);
      //]
    });

    test('registerAdder', () => {
      /**
       * Register a callback that will lazily add words to the global dictionary just before the
       * dictionary is used to encode a message.
       */
      api.protoMethod();
      const module = new Module(undefined, 'gd');
      //[
      const gd = new GlobalDict();

      const long1 = 'It is a truth universally acknowleged that a single man in ' +
        'possession of a large forturn must be in want of wife!';

      const long2 = 'The quick brown fox jumps over the lazy dogs';

      gd.registerAdder(module, (adder) => {
        adder(long1);
        adder(long2);
      });

      const payload = [long1, long2, long1, long2, long1];
      const msg = message.encodeMessage('T', payload, gd.globalDict);
      assert.same(msg.length, 17);
      const decoded = message.decodeMessage(msg.slice(1), gd.globalDict);
      assert.equals(decoded, payload);
      //]
    });

    test('deregisterAdder', () => {
      /**
       * Deregister a previously registered adder
       */
      api.protoMethod();
      //[
      const module = new Module(undefined, 'myModule');
      const gd = new GlobalDict();
      const myAdder = (adder) => {
        adder('foo');
      };
      gd.registerAdder(module, myAdder);
      assert.same(gd.getAdder('myModule'), myAdder);

      gd.deregisterAdder(module);

      assert.same(gd.getAdder('myModule'), undefined);
      //]
    });

    test('getAdder', () => {
      /**
       * Get the adder callback registered for a modulel.
       */
      api.protoMethod();
      //[
      const module = new Module(undefined, 'myModule');
      const gd = new GlobalDict();
      const myAdder = (adder) => {
        adder('foo');
      };
      gd.registerAdder(module, myAdder);

      assert.same(gd.getAdder('myModule'), myAdder);
      //]
    });

    test('addToDict', () => {
      /**
       * Add a word to the dictionary.
       */
      api.protoMethod();
      //[
      const gd = new GlobalDict();

      const long1 = 'The quick brown fox jumps over the lazy dogs';

      gd.addToDict(long1);

      const payload = [long1, long1, long1, long1];
      const msg = message.encodeMessage('T', payload, gd.globalDict);
      assert.same(msg.length, 14);
      const decoded = message.decodeMessage(msg.slice(1), gd.globalDict);
      assert.equals(decoded, payload);
      //]
    });

    test('globalDict', () => {
      /**
       * Get the finalized dictionary. After this property is accessed the dictionary may no longer
       * be added to.
       */
      api.protoProperty();
      //[
      const gd = new GlobalDict();

      assert.isTrue(gd.addToDict('foo'));
      assert.isTrue(gd.addToDict('bar'));

      assert.same(gd.globalDict.k2c.foo, 65533);

      assert.isFalse(gd.addToDict('baz'));
      //]
    });

    test('dictHashStr', () => {
      /**
       * A String for testing correct GlobalDict in being used. Not set until dictionary is finalized.
       */
      api.protoProperty();
      //[
      const gd = new GlobalDict();
      gd.addToDict('foo');
      gd.addToDict('bar');

      assert.same(gd.dictHashStr, undefined);

      assert.same(gd.globalDict.k2c.foo, 65533);

      assert.same(
        gd.dictHashStr,
        '830f622d1916386cbd214dbd1c4e84743de8cc468ef0ae10615a782fc7106481',
      );
      //]
    });

    test('globalDictEncoded', () => {
      /**
       * Serialize the global dictionary for transport.
       */
      api.protoMethod();
      //[
      const gd = new GlobalDict();
      gd.addToDict('foo');
      gd.addToDict('bar');

      const encoded = gd.globalDictEncoded();
      assert.equals(encoded, Buffer.from([0x66, 0x6f, 0x6f, 0xff, 0x62, 0x61, 0x72, 0xff, 0xff]));

      assert.same(encoded, gd.globalDictEncoded());
      //]
    });
  });
});
