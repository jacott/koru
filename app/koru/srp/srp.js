define((require)=>{
  'use strict';
  const Random          = require('../random').global;
  const BigInteger      = require('./big-integer');
  const SHA256          = require('./sha256');

  /**
   * srp.js
   *
   * Copyright (C) 2011--2014 Meteor Development Group
   * License: MIT
   *
   * Based on code from Meteor.com: meteor/packages/srp/srp.js
   */

  /**
   * Default parameter values for SRP.
   *
   */
  const _defaults = {
    hash(x) { return SHA256(x); },
    N: new BigInteger("EEAF0AB9ADB38DD69C33F80AFA8FC5E86072618775FF3C0B9EA2314C9C256576D674DF7496EA81D3383B4813D692C6E0E0D5D8E250B98BE48E495C1D6089DAD15DC7D7B46154D6B6CE8EF4AD69B15D4982559B297BCF1885C529F566660E57EC68EDBC3C05726CC02FD4CBF4976EAA9AFD5138FE8376435B9FC61D2FC0EB06E3", 16),
    g: new BigInteger("2")
  };
  _defaults.k = new BigInteger(
    _defaults.hash(
      _defaults.N.toString(16) +
        _defaults.g.toString(16)),
    16);

  /**
   * Process an options hash to create SRP parameters.
   *
   * Options can include:
   * - hash: Function. Defaults to SHA256.
   * - N: String or BigInteger. Defaults to 1024 bit value from RFC 5054
   * - g: String or BigInteger. Defaults to 2.
   * - k: String or BigInteger. Defaults to hash(N, g)
   */
  const paramsFromOptions = options =>{
    if (options === undefined) // fast path
      return _defaults;

    const ret = Object.assign({}, _defaults);

    for (const p of ['N', 'g', 'k']) {
      if (options[p]) {
        if (typeof options[p] === "string")
          ret[p] = new BigInteger(options[p], 16);
        else if (options[p] instanceof BigInteger)
          ret[p] = options[p];
        else
          throw new Error("Invalid parameter: " + p);
      }
    }

    if (options.hash)
      ret.hash = x => options.hash(x).toLowerCase();

    if (!options.k && (options.N || options.g || options.hash)) {
      ret.k = ret.hash(ret.N.toString(16) + ret.g.toString(16));
    }

    return ret;
  };

  const randInt = ()=> new BigInteger(Random.hexString(36), 16);

  /**
   * Generate a new SRP client object. Password is the plaintext password.
   *
   * options is optional and can include:
   * - a: client's private ephemeral value. String or
   *      BigInteger. Normally, this is picked randomly, but it can be
   *      passed in for testing.
   * - SRP parameters (see _defaults and paramsFromOptions below)
   */
  class Client {
    constructor(password, options) {
      this.params = paramsFromOptions(options);
      this.password = password;

      // shorthand
      const {N, g} = this.params;

      // construct public and private keys.
      let a, A;
      if (options && options.a) {
        if (typeof options.a === "string")
          a = new BigInteger(options.a, 16);
        else if (options.a instanceof BigInteger)
          a = options.a;
        else
          throw new Error("Invalid parameter: a");

        A = g.modPow(a, N);

        if (A.mod(N) === 0)
          throw new Error("Invalid parameter: a: A mod N == 0.");

      } else {
        while (!A || A.mod(N) === 0) {
          a = randInt();
          A = g.modPow(a, N);
        }
      }

      this.a = a;
      this.A = A;
      this.Astr = A.toString(16);
    }


    /**
     * Initiate an SRP exchange.
     *
     * returns { A: 'client public ephemeral key. hex encoded integer.' }
     */
    startExchange() {return {A: this.Astr}}

    /**
     * Respond to the server's challenge with a proof of password.
     *
     * challenge is an object with
     * - B: server public ephemeral key. hex encoded integer.
     * - identity: user's identity (SRP username).
     * - salt: user's salt.
     *
     * returns { M: 'client proof of password. hex encoded integer.' }
     * throws an error if it got an invalid challenge.
     */
    respondToChallenge(challenge) {
      // shorthand
      const {N, g, k, hash: H} = this.params;

      // XXX check for missing / bad parameters.
      this.identity = challenge.identity;
      this.salt = challenge.salt;
      this.Bstr = challenge.B;
      this.B = new BigInteger(this.Bstr, 16);

      if (this.B.mod(N) === 0)
        throw new Error("Server sent invalid key: B mod N == 0.");

      const u = new BigInteger(H(this.Astr + this.Bstr), 16);
      const x = new BigInteger(
        H(this.salt + H(this.identity + ":" + this.password)), 16);

      const kgx = k.multiply(g.modPow(x, N));
      const aux = this.a.add(u.multiply(x));
      const S = this.B.subtract(kgx).modPow(aux, N);
      const M = H(this.Astr + this.Bstr + S.toString(16));
      const HAMK = H(this.Astr + M + S.toString(16));

      this.S = S;
      this.HAMK = HAMK;

      return {M};
    }

    /**
     * Verify server's confirmation message.
     *
     * confirmation is an object with
     * - HAMK: server's proof of password.
     *
     * returns true or false.
     */
    verifyConfirmation(confirmation) {
      return (this.HAMK && (confirmation.HAMK === this.HAMK));
    }
  }

  /**
   * Generate a new SRP server object. Password is the plaintext password.
   *
   * options is optional and can include:
   * - b: server's private ephemeral value. String or
   *      BigInteger. Normally, this is picked randomly, but it can be
   *      passed in for testing.
   * - SRP parameters (see _defaults and paramsFromOptions below)
   */
  class Server {
    constructor(verifier, options) {
      this.params = paramsFromOptions(options);
      this.verifier = verifier;

      // shorthand
      const {N, g, k} = this.params;
      const v = new BigInteger(this.verifier.verifier, 16);

      // construct public and private keys.
      let b, B;
      if (options && options.b) {
        if (typeof options.b === "string")
          b = new BigInteger(options.b, 16);
        else if (options.b instanceof BigInteger)
          b = options.b;
        else
          throw new Error("Invalid parameter: b");

        B = k.multiply(v).add(g.modPow(b, N)).mod(N);

        if (B.mod(N) === 0)
          throw new Error("Invalid parameter: b: B mod N == 0.");

      } else {
        while (!B || B.mod(N) === 0) {
          b = randInt();
          B = k.multiply(v).add(g.modPow(b, N)).mod(N);
        }
      }

      this.b = b;
      this.B = B;
      this.Bstr = B.toString(16);
    }

    /**
     * Issue a challenge to the client.
     *
     * Takes a request from the client containing:
     * - A: hex encoded int.
     *
     * Returns a challenge with:
     * - B: server public ephemeral key. hex encoded integer.
     * - identity: user's identity (SRP username).
     * - salt: user's salt.
     *
     * Throws an error if issued a bad request.
     */
    issueChallenge(request) {
      // XXX check for missing / bad parameters.
      this.Astr = request.A;
      this.A = new BigInteger(this.Astr, 16);

      if (this.A.mod(this.params.N) === 0)
        throw new Error("Client sent invalid key: A mod N == 0.");

      // shorthand
      const {N, hash: H} = this.params;

      // Compute M and HAMK in advance. Don't send to client yet.
      const u = new BigInteger(H(this.Astr + this.Bstr), 16);
      const v = new BigInteger(this.verifier.verifier, 16);
      const avu = this.A.multiply(v.modPow(u, N));
      this.S = avu.modPow(this.b, N);
      this.M = H(this.Astr + this.Bstr + this.S.toString(16));
      this.HAMK = H(this.Astr + this.M + this.S.toString(16));

      return {
        identity: this.verifier.identity,
        salt: this.verifier.salt,
        B: this.Bstr
      };
    }

    /**
     * Verify a response from the client and return confirmation.
     *
     * Takes a challenge response from the client containing:
     * - M: client proof of password. hex encoded int.
     *
     * Returns a confirmation if the client's proof is good:
     * - HAMK: server proof of password. hex encoded integer.
     * OR null if the client's proof doesn't match.
     */
    verifyResponse(response) {return response.M !== this.M ? null : {HAMK: this.HAMK}}
  }

  const SRP = {
    Client, Server,

    /**
     * Generate a new SRP verifier. Password is the plaintext password.
     *
     * options is optional and can include:
     * - identity: String. The SRP username to user. Mostly this is passed
     *   in for testing.  Random UUID if not provided.
     * - salt: String. A salt to use.  Mostly this is passed in for
     *   testing.  Random UUID if not provided.
     * - SRP parameters (see _defaults and paramsFromOptions below)
     */
    generateVerifier: (password, options)=>{
      const params = paramsFromOptions(options);

      const identity = (options && options.identity) || Random.id();
      const salt = (options && options.salt) || Random.id();

      const x = params.hash(salt + params.hash(identity + ":" + password));
      const xi = new BigInteger(x, 16);
      const v = params.g.modPow(xi, params.N);

      return {
        identity,
        salt,
        verifier: v.toString(16)
      };
    },

    /**
     * Assert that password matches verifier.
     */
    checkPassword: (password, verifier)=>{
      // Client -> Server
      const csrp = new SRP.Client(password);
      const request = csrp.startExchange();

      // Server <- Client
      const ssrp = new SRP.Server(verifier);
      const challenge = ssrp.issueChallenge({A: request.A});

      // Client -> Server
      const response = csrp.respondToChallenge(challenge);
      return response.M === ssrp.M;
    }
  };

  return SRP;
});
