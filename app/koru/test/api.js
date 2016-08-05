define(function(require, exports, module) {
  const koru    = require('koru');
  const util    = require('koru/util');
  const TH      = require('./main');

  const ctx = module.ctx;

  class API {
    constructor(testCase, subject, subjectName, subjectModules) {
      this.testCase = testCase;
      this.subject = subject;
      this.subjectName = subjectName;
      this.subjectModules = subjectModules;
      this.methods = {};
    }

    static reset() {
      this.__afterTestCase = new WeakSet;
      this._apiMap = new Map;
      this._instance = null;
      this._objCache = new Map;
    }

    static module(subject, subjectName, subjectModules) {

      if (! this.isRecord) {
        return this._instance;
      }
      const tc = TH.test._currentTestCase;
      if (subject === undefined) {
        subject = ctx.modules[toId(tc)].exports;
      }

      this._instance = this._apiMap.get(subject);
      if (this._instance) return;

      const afterTestCase = this.__afterTestCase;
      afterTestCase.has(tc) || tc.after(testCaseFinished.bind(this));
      afterTestCase.add(tc);

      this._apiMap.set(subject, this._instance =
                       new API(tc, subject, subjectName || createSubjectName(subject, tc),
                               subjectModules || ctx.exportsModule(subject)));
      return this._instance;
    }

    static new() {return this.instance.new()}
    static method(methodName) {this.instance.method(methodName)}
    static done() {this.instance.done()}

    static get instance() {return this._instance || this.module()}

    static resolveObject(value, displayName, orig=value) {

      if (value === null || value === Object)
        return ['O', displayName];

      if (this._coreTypes.has(value))
        return [relType(orig, value), displayName, value.name];

      let api = this._apiMap.get(value);
      if (api) {
        return cache(this, value, orig, [relType(orig, value), displayName, api.testCase.name]);
      }

      let cValue = this._objCache.get(value);
      if (cValue) {
        if (cValue[0] === 'C' || orig !== value)
          return cache(this, orig, orig, [relType(orig, value), displayName, cValue[2]]);
        return cValue;
      }

      if (typeof value === 'function') {
        const proto = Object.getPrototypeOf(value);
        if (! proto)
          return ['O', displayName];
        let api = this._apiMap.get(proto);
        if (api) {
          return cache(this, value, orig, ['Os', displayName, api.testCase.name]);
        }

        return this.resolveObject(proto, displayName, orig);
      }
      if (! value.constructor || value.constructor === value)
        return ['O', displayName];
      value = value.constructor;
      return this.resolveObject(value, displayName, orig);
    }

    new() {
      const api = this;
      const {test} = TH;
      const calls = [];

      if (! api.newInstance) {
        api.newInstance = {
          test,
          sig: funcToSig(api.subject),
          intro: docComment(test.func),
          calls
        };
      }

      if (typeof api.subject !== 'function')
        throw new Error("api.new called on non function");

      return newProxy;

      function newProxy(...args) {
        const entry = [
           args.map(obj => api.valueTag(obj)),
           undefined,
         ];
        calls.push(entry);
        const ans = new api.subject(...args);
        entry[1] = api.valueTag(ans);
        return ans;
      };
    }

    method(methodName) {
      const api = this;
      const {test} = TH;
      const calls = [];
      const func = api.subject[methodName];

      let details = api.methods[methodName];
      if (! details) {
        details = api.methods[methodName] = {
          test,
          sig: funcToSig(func),
          intro: docComment(test.func),
          subject: api.valueTag(api.subject),
          calls
        };
      }


      const orig = koru.replaceProperty(api.subject, methodName, {
        value: function (...args) {
          const entry = [
            args.map(obj => api.valueTag(obj)),
            undefined,
          ];
          calls.push(entry);
          const ans = func.apply(this, args);
          entry[1] = api.valueTag(ans);
          return ans;
        }
      });

      test.onEnd(api._onEnd = () => {
        if (! api._onEnd) return;
        api._onEnd = null;
        if (orig) {
          Object.defineProperty(api.subject, methodName, orig);
        } else {
          delete api.subject[methodName];
        }
      });
    }

    done() {
      this._onEnd && this._onEnd();
    }

    testCaseFinished() {
    }

    $inspect() {
      return `{API(${this.subjectName})}`;
    }

    serialize(subject={}) {
      const methods = subject.methods || (subject.methods = {});
      const ids = (this.subjectModules||[]).map(m => m.id);
      const abstracts = ids.map(id => {
        const mod = ctx.modules[id+'-test'];
        if (mod && mod.body)
          return docComment(mod.body);
      });
      for (const methodName in this.methods) {
        const row = this.methods[methodName];
        methods[methodName] = {
          test: row.test.name,
          sig: row.sig,
          intro: row.intro,
          calls: serializeCalls(this, row.calls),
        };
      }
      const {newInstance} = this;
      if (newInstance) {
        newInstance.test = newInstance.test.name;
        newInstance.calls = serializeCalls(this, newInstance.calls);
      }
      return {
        subject: {
          ids,
          name: this.subjectName,
            abstracts,
        },
        newInstance,
        methods,
      };
    }

    valueTag(obj) {
      const mods = ctx.exportsModule(obj);
      if (mods)
        return ['M', obj];
      switch (typeof obj) {
      case 'function':
        return ['F', obj, obj.name || obj.toString()];
      case 'object':
        return ['O', obj, util.inspect(obj)];
      default:
        return obj;
      }
    }

    serializeValue(value) {
      if (Array.isArray(value)) {
        switch(value[0]) {
        case 'M':
          return ['M', this.bestId(value[1])];
        case 'O':
          const map = this.constructor._apiMap;
          let api =  map.get(value[1]);
          if (api)
            return ['M', api.testCase.name];


          return this.constructor.resolveObject(value[1], value[2]);
        default:
          return [value[0], value[2]];
        }
      }

      return value;
    }

    bestId(value) {
      return ctx.exportsModule(value)[0].id;
    }
  }

  API._coreTypes = new Set([
    Array,
    ArrayBuffer,
    Boolean,
    Date,
    Error,
    EvalError,
    Float32Array,
    Float64Array,
    Function,
    Int16Array,
    Int32Array,
    Int8Array,
    Map,
    Math,
    Number,
    Object,
    Promise,
    RangeError,
    ReferenceError,
    RegExp,
    Set,
    String,
    Symbol,
    SyntaxError,
    TypeError,
    Uint16Array,
    Uint32Array,
    Uint8Array,
    Uint8ClampedArray,
    URIError,
    WeakMap,
    WeakSet,
  ]);

  API.reset();

  API.isRecord = module.config().record;

  class APIOff extends API {
    method() {}
    done() {}
  }

  if (! API.isRecord) {
    API._instance = new APIOff();
  }

  TH.geddon.onEnd(module, function () {
    if (API.isRecord) {
      API._record();
      API.reset();
    }
  });

  function relType(orig, value) {
    return orig === value ? 'O' : orig instanceof value ? 'Oi' : 'Os';
  }

  function createSubjectName(subject, tc) {
    if (typeof subject === 'function') return subject.name;

    const mods = ctx.exportsModule(subject);
    if (mods) {
      const id = toId(tc);
      const mod = mods.find(mod => id === mod.id) || mods[0];
      return fileToCamel(mod.id);
    }
  }

  function toId(tc) {return tc.moduleId.replace(/-test$/, '');}

  function funcToSig(func) {
    const code = func.toString();
    let m = /^class[^{]*\{[\s\S]*constructor\s*(\([^\)]*\))\s*\{[\s\S]*$/.exec(code);
    if (m) return `constructor${m[1]}`;

    m = /^([^(]+\([^\)]*\))\s*\{[\s\S]*$/.exec(code);

    if (! m)
      throw new Error("Can't find signature of "+code);

    return m[1];
  }

  function fileToCamel(fn) {
    return fn.replace(/-(\w)/g, (m, l) => l.toUpperCase())
      .replace(/^.*\//, '');
  }

  function docComment(func) {
    let m = /\/\*\*\s*([\s\S]*?)\s*\*\*\//.exec(func.toString());
    return m && m[1].slice(2).replace(/^\s*\*\s/mg, '');
  }

  function testCaseFinished() {
    if (this._instance) {
      this._instance.testCaseFinished();
      this._instance = null;
    }
  }

  function cache(API, value, orig, result) {
    if (value !== orig)
      API._objCache.set(value, ['C', result[1], result[2]]);
    API._objCache.set(orig, result);
    return result;
  }

  function serializeCalls(api, calls) {
    return calls.map(([args, ans]) => {
      args = args.map(arg => api.serializeValue(arg));
      if (ans === undefined)
        return [args];
      else
        return [args, api.serializeValue(ans)];
    });
  }

  module.exports = API;
  require('koru/env!./api')(API);
});
