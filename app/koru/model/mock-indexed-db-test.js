isClient && define((require, exports, module)=>{
  const koru            = require('koru');
  const TH              = require('./test-helper');

  const {stub, spy, onEnd} = TH;

  const sut = require('./mock-indexed-db');
  const {IDBKeyRange} = window;

  let v = {};

  const canIUse = ()=> !! (
    window.IDBKeyRange && window.IDBKeyRange.bound('Lucy', 'Ronald', false, true).includes);

  if (! canIUse()) {
    TH.testCase(module, ({test})=>{
      test("not supported", ()=>{
        koru.info("Browser not supported");
        refute(canIUse());
      });
    });
    return;
  }

  TH.testCase(module, ({beforeEach, afterEach, group, test})=>{
    afterEach(()=>{
      v = {};
    });

    test("deleteDatabase", ()=>{
      const idb = new sut(1);
      idb._dbs.foo = {};
      const req = idb.deleteDatabase('foo');
      const onsuccess = req.onsuccess = stub();

      idb.yield();

      assert.called(onsuccess);
    });

    group("objectStore", ()=>{
      beforeEach(()=>{
        v.idb = new sut(1);
        const req = v.idb.open('foo', 1);
        req.onsuccess = ({target: {result}}) => {
          v.db = result;
        }; v.idb.yield();

        v.t1 = v.db.createObjectStore('t1', {keyPath: '_id'});
        v.t1.docs = {
          r2: v.r2 = {_id: 'r2', name: 'Ronald', age: 4},
          r1: v.r1 = {_id: 'r1', name: 'Ronald', age: 10},
          r3: v.r3 = {_id: 'r3', name: 'Allan', age: 3},
          r4: v.r4 = {_id: 'r4', name: 'Lucy', age: 7},
        };
      });

      test("get", ()=>{
        v.t1.get('r1').onsuccess = ({target: {result}}) => {
          v.ans = result;
        };
        v.idb.yield();
        assert.equals(v.ans, v.r1);
      });

      test("getAll", ()=>{
        v.t1.getAll()
          .onsuccess = ({target: {result}}) => {v.ans = result};
        v.idb.yield();
        assert.equals(v.ans, [v.r1, v.r2, v.r3, v.r4]);

        v.t1.getAll(IDBKeyRange.bound('r2', 'r4', false, true))
          .onsuccess = ({target: {result}}) => {v.ans = result};

        v.idb.yield();
        assert.equals(v.ans, [v.r2, v.r3]);
      });

      test("openCursor", ()=>{
        v.ans = [];
        v.t1.openCursor()
          .onsuccess = ({target: {result}}) => {
            if (result) {
              v.ans.push(result.value);
              if (v.ans.length < 3) result.continue();
            }
          };

        v.idb.yield();
        assert.equals(v.ans, [v.r1, v.r2, v.r3]);

        v.ans = [];
        v.t1.openCursor(IDBKeyRange.bound('r2', 'r4', false, true), 'prev')
          .onsuccess = ({target: {result}}) => {
            if (result) {
              v.ans.push(result.value);
              result.continue();
            }
          };

        v.idb.yield();
        assert.equals(v.ans, [v.r3, v.r2]);
      });

      test("count", ()=>{
        v.t1.count()
          .onsuccess = ({target: {result}}) => {v.ans = result};
        v.idb.yield();
        assert.equals(v.ans, 4);

        v.t1.count(IDBKeyRange.bound('r2', 'r4', false, true))
          .onsuccess = ({target: {result}}) => {v.ans = result};

        v.idb.yield();
        assert.equals(v.ans, 2);
      });

      test("createIndex", ()=>{
        v.t1Name = v.t1.createIndex('name', 'name');
        v.t1Name.get('Ronald')
          .onsuccess = ({target: {result}}) => {v.ans = result};
        v.idb.yield();
        assert.equals(v.ans, v.r1);

        v.t1Name.get('Allan')
          .onsuccess = ({target: {result}}) => {v.ans = result};
        v.idb.yield();
        assert.equals(v.ans, v.r3);
      });

      group("index", ()=>{
        beforeEach(()=>{
          v.t1Name = v.t1.createIndex('name', 'name');
        });

        test("index", ()=>{
          assert.same(v.t1.index('name'), v.t1Name);
        });

        test("getAll", ()=>{
          v.t1Name.getAll(IDBKeyRange.bound('Lucy', 'Ronald', false, true))
            .onsuccess = ({target: {result}}) => {v.ans = result};

          v.idb.yield();
          assert.equals(v.ans, [v.r4]);

          v.t1Name.getAll(IDBKeyRange.bound('Allan', 'Ronald', true, false))
            .onsuccess = ({target: {result}}) => {v.ans = result};

          v.idb.yield();
          assert.equals(v.ans, [v.r4, v.r1, v.r2]);
        });
      });

      group("multi path index", ()=>{
        beforeEach(()=>{
          v.t1Name = v.t1.createIndex('name', ['name', 'age']);
        });

        test("get.", ()=>{
          v.t1Name.get(['Ronald', 4])
            .onsuccess = ({target: {result}}) => {v.ans = result};
          v.idb.yield();
          assert.equals(v.ans, v.r2);

          v.t1Name.get('Allan')
            .onsuccess = ({target: {result}}) => {v.ans = result};
          v.idb.yield();
          assert.equals(v.ans, v.r3);
        });

        test("getAll", ()=>{
          v.t1Name.getAll(IDBKeyRange.bound(['Lucy'], ['Ronald'], false, true))
            .onsuccess = ({target: {result}}) => {v.ans = result};

          v.idb.yield();
          assert.equals(v.ans, [v.r4]);

          v.t1Name.getAll(IDBKeyRange.bound(['Allan', 'age'], ['Ronald', 'age'], true, false))
            .onsuccess = ({target: {result}}) => {v.ans = result};

          v.idb.yield();
          assert.equals(v.ans, [v.r4, v.r2, v.r1]);
        });

        test("count", ()=>{
          v.t1Name.count(IDBKeyRange.bound(['Lucy'], ['Ronald'], false, true))
            .onsuccess = ({target: {result}}) => {v.ans = result};

          v.idb.yield();
          assert.equals(v.ans, 1);

          v.t1Name.count(IDBKeyRange.bound(['Allan', 'age'], ['Ronald', 'age'], true, false))
            .onsuccess = ({target: {result}}) => {v.ans = result};

          v.idb.yield();
          assert.equals(v.ans, 3);
        });

        test("openCursor", ()=>{
          v.ans = [];
          v.t1Name.openCursor(IDBKeyRange.bound(['Allan', 'age'], ['Ronald', 'age'], true, false))
            .onsuccess = ({target: {result}}) => {
              if (result) {
                v.ans.push(result.value);
                result.delete();
                result.continue();
              }
            };

          v.idb.yield();
          assert.equals(v.ans, [v.r4, v.r2, v.r1]);
          assert.equals(v.t1.docs, {r3: {_id: 'r3', name: 'Allan', age: 3}});

        });
      });
    });
  });
});
