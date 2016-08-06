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
      this.newInstance = this.properties = this.currentComment =
        this.lastMethod = null;
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
    static property(name, options) {this.instance.property(name, options)}
    static comment(comment) {this.instance.comment(comment)}
    static example(body) {this.instance.example(body)}
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

    property(name, options) {
      const api = this;
      inner(name, options, this.subject[name],
                   this.properties || (this.properties = {}));

      function inner(name, options, value, properties) {
        const property = properties[name] || (properties[name] = {});
        property.value = api.valueTag(value);
        switch (typeof options) {
        case 'string':
          property.info = options;
          break;
        case 'undefined':
          property.info = docComment(TH.test.func);
          break;
        case 'function':
          property.info = options(value);
          break;
        case 'object':
          if (options != null) {
            if (options.info) property.info = options.info;
            if (options.properties) {
              const properties = property.properties ||
                      (property.properties = {});
              for (let name in options.properties) {
                inner(name, options.properties[name],
                      value[name], properties);
              }
            }
            break;
          }
        default:
          throw new Error("invalid options supplied for property "+name);
        }
      }
    }

    comment(comment) {
      this.currentComment = comment;
    }

    example(body) {
      if (! this.lastMethod)
        throw new Error("API.method has not been called!");
      const callLength = this.lastMethod.calls.length;
      try {
        body();
      } finally {
        const calls = this.lastMethod.calls.slice(callLength);
        this.lastMethod.calls.length = callLength;
        this.lastMethod.calls.push({
          body: body.toString().replace(/^.*{/, '').replace(/}\s*$/, ''),
          calls,
        });
      }
    }

    method(methodName) {
      const api = this;
      const {test} = TH;
      const func = api.subject[methodName];
      if (! func)
        throw new Error(`method "${methodName}" not found`);

      let details = api.methods[methodName];
      const calls = details ? details.calls : [];
      if (! details) {
        details = api.lastMethod = api.methods[methodName] = {
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
          const {currentComment} = api;
          if (currentComment) {
            entry.push(currentComment);
            api.currentComment = null;
          }
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
      const {newInstance, properties} = this;
      if (newInstance) {
        newInstance.test = newInstance.test.name;
        newInstance.calls = serializeCalls(this, newInstance.calls);
      }
      properties && serializeProperties(this, properties);
      return {
        subject: {
          ids,
          name: this.subjectName,
            abstracts,
        },
        newInstance,
        properties,
        methods,
      };
    }

    valueTag(obj) {
      const mods = ctx.exportsModule(obj);
      if (mods)
        return ['M', obj];
      switch (typeof obj) {
      case 'function':
        return ['F', obj, obj.name || funcToSig(obj)];
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
    let m = /^class[^{]*\{[\s\S]*constructor\s*(\([^\)]*\))\s*\{/.exec(code);
    if (m) return `constructor${m[1]}`;

    m = /^([^(]+\([^\)]*\))\s*\{/.exec(code);

    if (m)
      return m[1];

    m = /^(\([^\)]*\)|\w+)\s*=>/.exec(code);

    if (! m)
    throw new Error("Can't find signature of "+code);

    return m[1] += ' => {...}';
  }

  function fileToCamel(fn) {
    return fn.replace(/-(\w)/g, (m, l) => l.toUpperCase())
      .replace(/^.*\//, '');
  }

  function docComment(func) {

    let m = /\/\*\*\s*([\s\S]*?)\s*\*\*\//.exec(func.toString());
    return m && m[1].slice(2).replace(/^\s*\* ?/mg, '');
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
    return calls.map(row => {
      if (Array.isArray(row))
        return serializeCall(api, row);

      row.calls = serializeCalls(api, row.calls);
      return row;
    });
  }

  function serializeCall(api, [args, ans, comment]) {
    args = args.map(arg => api.serializeValue(arg));
    if (comment === undefined) {
      if (ans === undefined)
        return [args];
      else
        return [args, api.serializeValue(ans)];
    }
    return [args, api.serializeValue(ans), comment];
  }

  function serializeProperties(api, properties) {
    for (const name in properties) {
      const property = properties[name];
      if (property.value !== undefined)
        property.value = api.serializeValue(property.value);
      property.properties &&
        serializeProperties(api, property.properties);
    }
  }

  module.exports = API;
  require('koru/env!./api')(API);
});
