define((require, exports, module)=>{
  const util            = require('koru/util');
  const TH              = require('./test');

  const {stub, spy, onEnd, match: m} = TH;

  const Random = require('./random');

  TH.testCase(module, ({beforeEach, afterEach, group, test})=>{
    test("sequnce", ()=>{
      const random = Random.create(0);
      assert.same(random.id(), "kFsE9G6DL26jiPd2U");
      assert.same(random.id(), "o8kyB8YoOT2NCM03U");
      assert.same(random.id(), "3KkBsZqIxSLG9cNmT");
      assert.same(random.id(), "j1JePqz3IKW31RKSR");

      assert.equals(random.fraction(), 0.12989023071713746);
      assert.equals(random.fraction(), 0.8229060908779502);
      assert.equals(random.fraction(), 0.07078907801769674);
    });

    test("format", ()=>{
      const randSpy = isServer ? spy(requirejs.nodeRequire('crypto'), 'randomBytes')
              : spy(window.crypto, 'getRandomValues');
      const id = Random.id();
      assert.same(id.length, util.idLen);
      assert.match(id, /^[0-9a-zA-Z]*$/);


      if (isServer) {
        assert.calledWith(randSpy, 17);
      } else {
        assert.calledWith(randSpy, m(
          u32 => u32.constructor === Uint32Array));
      }

      randSpy.reset();

      const rand = Random.create();

      const numDigits = 9;
      const hexStr = rand.hexString(numDigits);

      let u8;

      if (isServer) {
        assert.calledWith(randSpy, 5);
        u8 = randSpy.firstCall.returnValue;
      } else {
        assert.calledWith(randSpy, m(a => u8 = a));
      }
      assert.equals(util.twoDigits(u8[2].toString(16)), hexStr.substring(4, 6));

      assert.same(hexStr.length, numDigits);
      parseInt(hexStr, 16); // should not throw
      const frac = rand.fraction();
      assert.isTrue(frac < 1.0);
      assert.isTrue(frac >= 0.0);
    });

    test("replace random", ()=>{
      onEnd(() => {util.thread.random = null});
      util.thread.random = {id() {return "123"}, hexString(value) {return "hs"+value}};
      assert.same(Random.id(), "123");
      const id = Random.global.id();
      assert.same(id.length, 17);
      assert.match(id, /^[0-9a-zA-Z]*$/);
      assert.same(Random.hexString("a123"), "hsa123");
    });

    test("same create", ()=>{
      assert.same(Random.create, Random.global.create);
    });
  });
});
