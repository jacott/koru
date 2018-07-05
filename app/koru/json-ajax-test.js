isClient && define((require, exports, module)=>{
  const koru            = require('koru');
  const TH              = require('koru/test-helper');

  const {stub, spy, onEnd, intercept} = TH;

  const sut = require('./json-ajax');

  let v = {};

  TH.testCase(module, ({beforeEach, afterEach, group, test})=>{
    beforeEach(()=>{
      intercept(window, 'XMLHttpRequest', function () {
        v.req = this;
        this.addEventListener = stub();
        this.open = stub();
        this.setRequestHeader = stub();
        this.send = stub();
      });
    });

    afterEach(()=>{
      v = {};
    });

    test("null response", ()=>{
      sut.get("/url", v.callback = stub());
      assert.calledWith(v.req.addEventListener, "load", TH.match(f => v.load = f));
      v.req.status = 200;
      v.req.responseText = "";
      v.load();
      assert.calledWith(v.callback, null, null);
    });

    test("callback exception", ()=>{
      sut.get("/url", v.callback = stub().withArgs(TH.match(ex => {
        assert.match(ex.message, /JSON/);
        return true;
      })).throws(new koru.Error(400, 'testing')));
      assert.calledWith(v.req.addEventListener, "load", TH.match(f => v.load = f));

      v.req.status = 200;
      v.req.responseText = "invalid}json";
      assert.exception(()=>{
        v.load();
      }, {error: 400});
    });

    test("get", ()=>{
      sut.get("/url", v.callback = stub());
      assert.calledWithExactly(v.req.open, 'GET', "/url", true);
      refute.calledWith(v.req.setRequestHeader, 'Authorization');
      assert.calledWithExactly(v.req.send);
      assert.calledWith(v.req.addEventListener, "load", TH.match(f => v.load = f));
      v.req.status = 402;
      v.req.responseText = "Foo";
      v.load();
      assert.calledWith(v.callback, TH.match(err => {
        return err && err.error === 402 && err.reason === "Foo";
      }));
    });

    test("user and password", ()=>{
      sut.post("/url", {body: true}, 'foo', 'secret', v.callback = stub());
      assert.calledWithExactly(v.req.open, 'POST', "/url", true);
      assert.calledWith(v.req.setRequestHeader, 'Authorization', 'Basic Zm9vOnNlY3JldA==');
      sut.get("/url", 'foo', 'secret', v.callback = stub());
      assert.calledWithExactly(v.req.open, 'GET', "/url", true);
    });

    test("post", ()=>{
      sut.post("/url", {body: true}, v.callback = stub());

      assert.calledWith(v.req.addEventListener, "load", TH.match(f => v.load = f));
      assert.calledWith(v.req.addEventListener, "error", TH.match(f => v.error = f));
      assert.calledWith(v.req.open, 'POST', "/url");
      assert.calledWith(v.req.setRequestHeader, "Content-Type", "application/json;charset=UTF-8");
      assert.calledWith(v.req.send, JSON.stringify({body: true}));

      v.req.status = 203;
      v.req.responseText = JSON.stringify(["hello"]);
      v.load();
      assert.calledWith(v.callback, null, ["hello"]);
      v.callback.reset(); v.error();
      assert.calledWith(v.callback, TH.match(function (err) {
        return err && err.message === "Network Error";
      }));
      v.req.responseText = "{";
      v.callback.reset(); v.load();
      assert.calledWith(v.callback, TH.match(function (err) {
        return err instanceof SyntaxError;
      }));
      v.req.status = 403;
      v.req.responseText = "Foo";
      v.callback.reset(); v.load();
      assert.calledWith(v.callback, TH.match(function (err) {
        return err && err.message === "Foo [403]";
      }));
    });
  });
});
