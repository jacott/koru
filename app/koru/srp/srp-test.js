define((require, exports, module)=>{
  'use strict';
  const TH              = require('koru/test-helper');
  const SRP             = require('./srp');

  TH.testCase(module, ({beforeEach, afterEach, group, test})=>{
    test("srp - good exchange", ()=>{
      const password = 'hi there!';
      const verifier = SRP.generateVerifier(password);

      const C = new SRP.Client(password);
      const S = new SRP.Server(verifier);

      const request = C.startExchange();
      const challenge = S.issueChallenge(request);
      const response = C.respondToChallenge(challenge);
      const confirmation = S.verifyResponse(response);

      assert(confirmation);
      assert(C.verifyConfirmation(confirmation));
    });

    test("srp - bad exchange", ()=>{
      const verifier = SRP.generateVerifier('one password');

      const C = new SRP.Client('another password');
      const S = new SRP.Server(verifier);

      const request = C.startExchange();
      const challenge = S.issueChallenge(request);
      const response = C.respondToChallenge(challenge);
      const confirmation = S.verifyResponse(response);

      refute(confirmation);
    });


    test("srp - fixed values", ()=>{
      // Test exact values during the exchange. We have to be very careful
      // about changing the SRP code, because changes could render
      // people's existing user database unusable. This test is
      // intentionally brittle to catch change that could affect the
      // validity of user passwords.

      const identity = "b73d9af9-4e74-4ce0-879c-484828b08436";
      const salt = "85f8b9d3-744a-487d-8982-a50e4c9f552a";
      const password = "95109251-3d8a-4777-bdec-44ffe8d86dfb";
      const a = "dc99c646fa4cb7c24314bb6f4ca2d391297acd0dacb0430a13bbf1e37dcf8071";
      const b = "cf878e00c9f2b6aa48a10f66df9706e64fef2ca399f396d65f5b0a27cb8ae237";

      const verifier = SRP.generateVerifier(
        password, {identity: identity, salt: salt});

      const C = new SRP.Client(password, {a: a});
      const S = new SRP.Server(verifier, {b: b});

      const request = C.startExchange();
      assert.same(request.A, "8a75aa61471a92d4c3b5d53698c910af5ef013c42799876c40612d1d5e0dc41d01f669bc022fadcd8a704030483401a1b86b8670191bd9dfb1fb506dd11c688b2f08e9946756263954db2040c1df1894af7af5f839c9215bb445268439157e65e8f100469d575d5d0458e19e8bd4dd4ea2c0b30b1b3f4f39264de4ec596e0bb7");

      const challenge = S.issueChallenge(request);
      assert.same(challenge.B, "77ab0a40ef428aa2fa2bc257c905f352c7f75fbcfdb8761393c9dc0f730bbb0270ba9f837545b410c955c3f761494b329ad23c6efdec7e63509e538c2f68a3526e072550a11dac46017718362205e0c698b5bed67d6ff475aa92c191ca169f865c81a1a577373c449b98df720c7b7ff50536f9919d781e698025fd7164932ba7");

      const response = C.respondToChallenge(challenge);
      assert.same(response.M, "8705d31bb61497279adf44eef6c167dcb7e03aa7a42102c1ea7e73025fbd4cd9");

      const confirmation = S.verifyResponse(response);
      assert.same(confirmation.HAMK, "07a0f200392fa9a084db7acc2021fbc174bfb36956b46835cc12506b68b27bba");

      assert(C.verifyConfirmation(confirmation));
    });


    test("srp - options", ()=>{
      // test that all options are respected.
      //
      // Note, all test strings here should be hex, because the 'hash'
      // function needs to output numbers.

      const baseOptions = {
        hash(x) { return x; },
        N: 'b',
        g: '2',
        k: '1'
      };
      const verifierOptions = Object.assign({
        identity: 'a',
        salt: 'b'
      }, baseOptions);
      const clientOptions = Object.assign({
        a: "2"
      }, baseOptions);
      const serverOptions = Object.assign({
        b: "2"
      }, baseOptions);

      const verifier = SRP.generateVerifier('c', verifierOptions);;

      assert.same(verifier.identity, 'a');
      assert.same(verifier.salt, 'b');
      assert.same(verifier.verifier, '3');

      const C = new SRP.Client('c', clientOptions);
      const S = new SRP.Server(verifier, serverOptions);

      const request = C.startExchange();
      assert.same(request.A, '4');

      const challenge = S.issueChallenge(request);
      assert.same(challenge.identity, 'a');
      assert.same(challenge.salt, 'b');
      assert.same(challenge.B, '7');

      const response = C.respondToChallenge(challenge);
      assert.same(response.M, '471');

      const confirmation = S.verifyResponse(response);
      assert(confirmation);
      assert.same(confirmation.HAMK, '44711');
    });
  });
});
