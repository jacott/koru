define((require, exports, module) => {
  'use strict';
  const accSha256       = require('koru/crypto/acc-sha256');
  const message         = require('koru/session/message');

  class GlobalDict {
    #adders = {};
    #globalDict = undefined;
    #globalDictEncoded = undefined;
    #preloadDict = message.newGlobalDict();
    #dictHash = [1, 2, 3, 5, 7, 11, 13, 17]; // dont' change this without bumping koru.PROTOCOL_VERSION
    #dictHashStr = undefined;

    addToDict(word) {
      if (this.#preloadDict === undefined) return false;
      if (message.getStringCode(this.#preloadDict, word) == -1) {
        accSha256.add(word, this.#dictHash);
        message.addToDict(this.#preloadDict, word);
      }
      return true;
    }

    #buildGlobalDict() {
      const addToDict = this.addToDict.bind(this);
      for (const name in this.#adders) {
        this.#adders[name](addToDict);
      }
      this.#globalDict = this.#preloadDict;
      this.#dictHashStr = accSha256.toHex(this.#dictHash);
      this.#preloadDict = this.#dictHash = undefined;

      message.finalizeGlobalDict(this.#globalDict);
      return this.#globalDict;
    };

    globalDictEncoded() {
      return this.#globalDictEncoded ??= message.encodeDict(this.globalDict);
    }

    get dictHashStr() {
      return this.#dictHashStr;
    }

    registerAdder(module, adder) {
      this.#adders[module.id] = adder;
    }

    deregisterAdder(module) {
      delete this.#adders[module.id];
    }

    get globalDict() {
      return this.#globalDict ??= this.#buildGlobalDict();
    }

    getAdder(id) {
      return this.#adders[id];
    }
  }

  GlobalDict.main = new GlobalDict();

  return GlobalDict;
});
