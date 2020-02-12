define((require, exports, module)=>{
  'use strict';
  /**
   * Queue callbacks to happen after previous queued callbacks using promises.
   **/
  const TH              = require('koru/test-helper');
  const api             = require('koru/test/api');

  const {stub, spy, util} = TH;

  const PromiseQueue = require('./promise-queue');

  TH.testCase(module, ({before, after, beforeEach, afterEach, group, test})=>{
    test("constructor", async ()=>{
      /**
       * Construct a PromiseQueue
       **/
      const PromiseQueue = api.class();

      //[
      const queue = new PromiseQueue();
      let i = 4;
      queue.add(()=>{ i = i * 2});
      queue.add(()=>{ ++i});

      assert.same(i, 4);

      await queue.empty();
      assert.same(i, 9);
      //]
    });

    test("add", async ()=>{
      /**
       * add a callback to the queue. Callback is called even if a previous callback throws an
       * exception. The previous callbacks output is available as an argument to this callback.
       **/
      api.protoMethod();
      //[
      const queue = new PromiseQueue();
      let i = 4;
      queue.add(()=>{ throw "err"});
      queue.add((err) => i += err === "err" ? 2 : -2);
      queue.add(()=>{ ++i});
      await queue.empty();
      assert.same(i, 7);
      //]
    });

    test("empty", async ()=>{
      /**
       * wait for the queue to be empty
       **/
      api.protoMethod();
      //[
      const queue = new PromiseQueue();
      await queue.empty();

      let i = 4;
      queue.add(()=>{ i = i * 2});
      const p = queue.empty(); // p won't resolve until queue empty

      queue.add(()=>{ ++i});

      assert.same(i, 4);

      queue.add(()=>{ i *= 5});

      await p;
      assert.same(i, 45);

      queue.add(()=>{ i *= 10});

      await queue.empty();
      await queue.empty();

      assert.same(i, 450);
      //]
    });
  });
});
