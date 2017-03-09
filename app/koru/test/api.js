define(function(require, exports, module) {
  const koru        = require('koru');
  const jsParser    = require('koru/parse/js-parser');
  const {stubName$} = require('koru/symbols');
  const util        = require('koru/util');
  const TH          = require('./main');

  const ctx = module.ctx;

  class API {
    constructor(parent, moduleOrSubject, subjectName, testModule) {
      this.parent = parent;
      if (parent) {
        this.module = undefined;
        this.subject = moduleOrSubject;
      } else {
        this.module = moduleOrSubject;
        this.subject = moduleOrSubject && moduleOrSubject.exports;
      }
      this.subjectName = subjectName;
      this.testModule = testModule || (this.parent && this.parent.testModule);
      this.abstract = docComment(
        (this.testModule && this.testModule.body) || ''
      );

      this.newInstance =
        this.properties = this.protoProperties =
        this.currentComment = this.target =
        this.propertyName = this.initInstExample =
        this.initExample = undefined;

      this.methods = Object.create(null);
      this.protoMethods = Object.create(null);
      this.innerSubjects = Object.create(null);
      this.customMethods = Object.create(null);
    }

    static reset() {
      this._instance = null;
      this.__afterTestCase = new WeakSet;
      this._moduleMap = new Map;
      this._subjectMap = new Map;
      this._objCache = new Map;
    }

    static module(subjectModule, subjectName, options) {
      const tc = TH.test._currentTestCase;
      if (subjectModule == null) {
        subjectModule = ctx.modules[toId(tc)];
      }
      const subject = subjectModule.exports;
      if (! this.isRecord) {
        this._instance.subject = subject;
        return this._instance;
      }

      this._instance = this._moduleMap.get(subjectModule);
      if (this._instance) return this._instance;

      const afterTestCase = this.__afterTestCase;
      afterTestCase.has(tc) || tc.after(testCaseFinished.bind(this));
      afterTestCase.add(tc);

      this._mapSubject(subject, subjectModule);
      this._moduleMap.set(
        subjectModule, this._instance = new this(
          null, subjectModule,
          subjectName || createSubjectName(subject, tc),
          ctx.modules[tc.moduleId]
        )
      );
      if (options) {
        if (options.initExample)
          this._instance.initExample = options.initExample;

        if (options.initInstExample)
          this._instance.initInstExample = options.initInstExample;
      }

      return this._instance;
    }

    static innerSubject(subject, subjectName, options) {return this.instance.innerSubject(subject, subjectName, options)}
    static new(sig) {return this.instance.new(sig)}
    static custom(func, name=func.name, sig=funcToSig(func)) {
      return this.instance.custom(func, name, sig);
    }
    static property(name, options) {this.instance.property(name, options)}
    static protoProperty(name, options, subject) {this.instance.protoProperty(name, options, subject)}
    static comment(comment) {this.instance.comment(comment)}
    static example(body) {return this.instance.example(body)}
    static exampleCont(body) {return this.instance.exampleCont(body)}
    static method(methodName) {this.instance.method(methodName)}
    static protoMethod(methodName, subject) {this.instance.protoMethod(methodName, subject)}
    static done() {this.instance.done()}

    static get instance() {return this._instance || this.module()}

    static resolveObject(value, displayName, orig=value) {
      if (value === null || value === Object)
        return ['O', displayName];

      const resolveFunc = this._resolveFuncs.get(value);
      if (resolveFunc)
        return resolveFunc(relType(orig, value), orig);

      if (this._coreTypes.has(value))
        return [relType(orig, value), displayName, value.name];

      let api = this.valueToApi(value);
      if (api) {
        return cache(this, value, orig, [relType(orig, value), displayName, api.moduleName]);
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

        let api = this.valueToApi(proto);
        if (api) {
          return cache(this, value, orig, ['Os', displayName, api.moduleName]);
        }

        return this.resolveObject(proto, displayName, orig);
      }
      if (! value.constructor || value.constructor === value)
        return ['O', displayName];
      value = value.constructor;
      return this.resolveObject(value, displayName, orig);
    }

    static valueToApi(value) {
      const entry = this._subjectMap.get(value);
      if (! entry)
        return;

      const item = entry[0];
      if (item instanceof API)
        return item;
      return this._moduleMap.get(item);
    }

    static _mapSubject(subject, module) {
      const smap = this._subjectMap.get(subject);

      if (smap) {
        if (smap[0] === module)
          return;
        this._subjectMap.set(subject, [module, smap]);
      } else
        this._subjectMap.set(subject, [module, null]);
    }

    get moduleName() {
      if (this.module)
        return this.module.id;
      const {parent} = this;
      return parent && parent.moduleName +
        (parent.properties && this.propertyName ?
         '.'+this.propertyName : '::'+this.subjectName);
    }

    innerSubject(subject, subjectName, options) {
      if (typeof subject === 'string') {
        var propertyName = subject;
        if (! (this.properties && this.properties[subject]))
          this.property(subject, options);
        if (! subjectName)
          subjectName = subject;
        subject = this.subject[subject];
      }
      subjectName = subjectName || createSubjectName(subject);

      if (! subjectName)
        throw new Error("Don't know the name of the subject!");

      const ThisAPI = this.constructor;

      let ans = this.innerSubjects[subjectName];
      if (! ans) {
        this.innerSubjects[subjectName] = ans =
          new ThisAPI(this, subject, subjectName);
        ThisAPI._moduleMap.set(
          {id: `${this.id}${propertyName ? '.' : '::'}${subjectName}`}, ans);
        ThisAPI._mapSubject(subject, ans);
      }

      if (propertyName) ans.propertyName = propertyName;
      if (options) {
        if (options.abstract) {
          ans.abstract = typeof options.abstract === 'string' ?
            options.abstract :
            docComment(options.abstract);
        }

        if (options.initExample)
          ans.initExample = options.initExample;

        if (options.initInstExample)
          ans.initInstExample = options.initInstExample;
      }
      return ans;
    }

    new(sig) {
      const api = this;

      if (typeof api.subject !== 'function')
        throw new Error("api.new called on non function");

      const {test} = TH;
      const calls = [];

      switch(typeof sig) {
      case 'function':
        sig = funcToSig(api.subject);
        break;
      case 'undefined':
        sig = funcToSig(api.subject).replace(/^[^(]*/, 'constructor');
        break;
      }

      if (! api.newInstance) {
        api.newInstance = {
          test,
          sig,
          intro: docComment(test.func),
          calls
        };
      }

      api.target = api.newInstance;

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

    custom(func, name=func.name, sig=funcToSig(func)) {
      const api = this;
      if (typeof func !== 'function')
        throw new Error("api.custom called with non function");

      if (! name)
        throw new Error("Can't derive name of function");

      const {test} = TH;
      const calls = [];

      let details = api.customMethods[name];
      if (! details) details = api.customMethods[name] = {
        test,
        sig,
        intro: docComment(test.func),
        calls
      };
      api.target = details;

      return proxy;

      function proxy(...args) {
        const entry = [
          args.map(obj => api.valueTag(obj)),
          undefined,
        ];
        calls.push(entry);
        const ans = func.apply(this, args);
        entry[1] = api.valueTag(ans);
        return ans;
      };
    }

    protoProperty(name, options, subject=this.subject.prototype) {
      property(this, 'protoProperties', subject, name, options);
    }

    property(name, options) {
      property(this, 'properties', this.subject, name, options);
    }

    comment(comment) {
      this.currentComment = comment;
    }

    example(body) {
      return example(this, body);
    }

    exampleCont(body) {
      return example(this, body, 'cont');
    }

    method(methodName) {
      method(this, methodName, this.subject, this.methods);
    }

    protoMethod(methodName, subject=this.subject.prototype) {
      method(this, methodName, subject, this.protoMethods);
    }

    done() {
      TH.test._apiOnEnd && TH.test._apiOnEnd();
    }

    $inspect() {
      return `{API(${this.subjectName})}`;
    }

    serialize() {
      const {methods, protoMethods, customMethods, abstract} = this;

      const procMethods = list => {
        for (let methodName in list) {
          const row = list[methodName];
          list[methodName] = {
            test: row.test.name,
            sig: row.sig,
            intro: row.intro,
            calls: serializeCalls(this, row.calls),
          };
        }
      };

      procMethods(methods);
      procMethods(protoMethods);
      procMethods(customMethods);


      const id = this.testModule.id.replace(/-test$/, '');

      const ans = {
        id,
        subject: {
          name: this.subjectName,
          abstract,
        },
        methods,
        protoMethods,
        customMethods,
      };

      if (this.initExample) ans.initExample = extractFnBody(this.initExample);
      if (this.initInstExample) ans.initInstExample = extractFnBody(this.initInstExample);

      const {newInstance, properties, protoProperties} = this;
      if (newInstance) {
        newInstance.test = newInstance.test.name;
        newInstance.calls = serializeCalls(this, newInstance.calls);
        ans.newInstance = newInstance;
      }
      if (properties) {
        serializeProperties(this, properties);
        ans.properties = properties;
      }
      if (protoProperties) {
        serializeProperties(this, protoProperties);
        ans.protoProperties = protoProperties;
      }

      if (this.module) {
        if (this.module._requires)
          ans.requires = Object.keys(this.module._requires).sort();

        let otherMods = this.constructor._subjectMap.get(this.subject);
        if (otherMods) {
          const otherIds = [];
          for (; otherMods; otherMods = otherMods[1]) {
            if (! (otherMods[0] instanceof API) &&
                otherMods[0].id && otherMods[0].id !== id)
              otherIds.push(otherMods[0].id);
          }
          if (otherIds) {
            const modifies = [], modifiedBy = [];
            const {modules} = this.module.ctx;
            otherIds.forEach(oId => {
              const oMod = modules[oId];
              if (oMod && koru.isRequiredBy(oMod, this.module))
                modifies.push(oId);
              else if (oMod && koru.isRequiredBy(this.module, oMod))
                modifiedBy.push(oId);
            });
            if (modifies.length)
              ans.modifies = modifies.sort();
            if (modifiedBy.length)
              ans.modifiedBy = modifiedBy.sort();
          }
        }
      }

      return ans;
    }

    valueTag(obj) {
      const mods = ctx.exportsModule(obj);
      if (mods)
        return ['M', obj];
      switch (typeof obj) {
      case 'function':
        return ['F', obj, obj[stubName$] || obj.name || funcToSig(obj)];
      case 'object':
        if (obj === null)
          return obj;
        let resolveFunc = this.constructor._resolveFuncs.get(obj) ||
              this.constructor._resolveFuncs.get(obj.constructor);

        return ['O', obj, resolveFunc ? resolveFunc('O', obj)[1] : inspect(obj)];
      default:
        return obj;
      }
    }

    serializeValue(value) {
      if (Array.isArray(value)) {
        let api;
        switch(value[0]) {
        case 'M':
          return ['M', this.bestId(value[1])];
        case 'F':
          if (Object.getPrototypeOf(value[1]) === Function.prototype)
            return ['F', value[2]];
        case 'O':
          api =  this.constructor.valueToApi(value[1]);
          if (api)
            return ['M', api.moduleName];


          return this.constructor.resolveObject(value[1], value[2]);
        default:
          return [value[0], value[2]];
        }
      }

      if (value === undefined)
        return ['U', 'undefined'];

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

  API._coreDisplay = new Map([
    [Promise, '{a promise}'],
  ]);

  function resolveModule(type, value) {
    if (type === 'Oi')
      return [type, `{Module:${value.id}}`, 'Module'];
    return [type, value.name, 'Module'];
  }

  API._resolveFuncs = new Map([
    [TH.MockModule, resolveModule],

    [module.constructor, resolveModule],

    [Array, (type, value) => {
      if (type === 'Oi') {
        if (value.length > 20)
          value = value.slice(0, 20);
        const display = value.map(item => {
          let resolveFunc = API._resolveFuncs.get(item.constructor);
          if (resolveFunc)
            return resolveFunc('Oi', item)[1];
          else
            return inspect(item);
        });
        return [type, `[${display.join(", ").slice(0, 150)}]`, 'Array'];
      }
      return [type, 'Array', 'Array'];
    }],
  ]);

  API.reset();

  API.isRecord = module.config().record;

  class APIOff extends API {
    new() {
      return (...args) => {
        return new this.subject(...args);
      };
    }
    property() {}
    comment() {}
    example(body) {return typeof body === 'function' && body();}
    exampleCont(body) {return typeof body === 'function' && body();}
    method() {}
    protoMethod() {}
    protoProperty() {}
    done() {}
    custom(func) {return func}
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
    switch (typeof subject) {
    case 'function': return subject.name;
    case 'string': return subject;
    }
    const mods = ctx.exportsModule(subject);
    if (mods) {
      const id = tc && toId(tc);
      const mod = mods.find(mod => id === mod.id) || mods[0];
      return fileToCamel(mod.id);
    }
  }

  function toId(tc) {return tc.moduleId.replace(/-test$/, '');}

  function extractFnBody(body) {
    if (typeof body === 'string')
      return body;

    body = body.toString();

    const m = /^\([^)]*\)\s*=>\s*(?=[^{\s])/.exec(body);

    if (m) return  body.slice(m[0].length);

    return body.replace(/^.*{(\s*\n)?/, '').replace(/}\s*$/, '');
  }

  function funcToSig(func) {
    return jsParser.extractCallSignature(func);
  }

  function fileToCamel(fn) {
    return fn.replace(/-(\w)/g, (m, l) => l.toUpperCase())
      .replace(/^.*\//, '');
  }

  function docComment(func) {
    const code = func.toString();
    let m = /\)\s*{\s*/.exec(code);
    if (! m)
      return;
    let re = /\/\*\*\s*([\s\S]*?)\s*\*\*\//y;
    re.lastIndex = m.index+m[0].length;
    m = re.exec(func.toString());
    return m && m[1].slice(2).replace(/^\s*\* ?/mg, '');
  }

  function testCaseFinished() {
    if (this._instance) {
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
    if (comment)
      return [args, ans === undefined ? [''] : api.serializeValue(ans), comment];

    if (ans === undefined)
      return [args];
    else
      return [args, api.serializeValue(ans)];
  }

  function serializeProperties(api, properties) {
    for (let name in properties) {
      const property = properties[name];
      if (property.value !== undefined)
        property.value = api.serializeValue(property.value);
      if (property.calls)
        property.calls = serializeCalls(api, property.calls);
      property.properties &&
        serializeProperties(api, property.properties);
    }
  }

  function property(api, field, subject, name, options) {
    inner(name, options,
          Object.getOwnPropertyDescriptor(subject, name),
          subject[name],
          api[field] || (api[field] = {}));

    function inner(name, options, desc, value, properties) {
      const property = properties[name] || (properties[name] = {});
      if (! desc || desc.get || desc.set) {
        let savedValue = subject[name];
        const calls = property.calls || (property.calls = []);
        koru.replaceProperty(subject, name, {
          get() {
            const entry = [[], null];
            addComment(api, entry);
            calls.push(entry);
            const ans = desc ? desc.get.call(this) : savedValue;
            entry[1] = api.valueTag(ans);
            return ans;
          },
          set(value) {
            const entry = [[api.valueTag(value)], undefined];
            addComment(api, entry);
            calls.push(entry);
            savedValue = value;
            desc && desc.set.call(this, value);
          }
        });

        onTestEnd(api, () => {
          if (desc)
            Object.defineProperty(subject, name, desc);
          else
            delete subject[name];
        });

      } else {
        property.value = api.valueTag(value);
      }
      switch (typeof options) {
      case 'string':
        property.info = options;
        break;
      case 'function':
        property.info = options(value);
        break;
      case 'object':
        if (options != null) {
          if (options.info) property.info = options.info;
          if (options.intro) property.info = options.intro;
          if (options.properties) {
            const properties = property.properties ||
                    (property.properties = {});
            for (let name in options.properties) {
              inner(name, options.properties[name],
                    Object.getOwnPropertyDescriptor(value, name),
                    value[name], properties);
            }
          }
          break;
        }
      case 'undefined':
        property.info = docComment(TH.test.func);
        break;
      default:
        throw new Error("invalid options supplied for property "+name);
      }
    }
  }

  function method(api, methodKey, obj, methods) {
    const {test} = TH;
    const func = obj[methodKey];
    const methodName = methodKey.toString();
    if (! func)
      throw new Error(`method "${methodName}" not found`);

    let details = methods[methodName];
    const calls = details ? details.calls : [];
    if (! details) {
      let sig = funcToSig(func).replace(/^function\s*(?=\()/, methodName);
      if (! sig.startsWith(methodName)) {
        if (sig.startsWith('('))
          sig = methodName+sig.slice(0, jsParser.findMatch(sig, 0, '('));
        else {
          if (sig.endsWith(' => {/*...*/}'))
            sig = sig.slice(0, -13);
          sig = `${methodName}(${sig})`;
        }
      }

      details = methods[methodName] = {
        test,
        sig,
        intro: docComment(test.func),
        subject: api.valueTag(api.subject),
        calls
      };
    }
    api.target = details;

    const desc = koru.replaceProperty(obj, methodKey, {
      value(...args) {
        const entry = [
          args.map(obj => api.valueTag(obj)),
          undefined,
        ];
        addComment(api, entry);
        calls.push(entry);
        const ans = func.apply(this, args);
        entry[1] = api.valueTag(ans);
        return ans;
      }
    });

    onTestEnd(api, () => {
      if (desc) {
        Object.defineProperty(obj, methodKey, desc);
      } else {
        delete obj[methodKey];
      }
    });
  }

  function example(api, body, cont) {
    if (! api.target)
      throw new Error("API target not set!");
    const callLength = api.target.calls.length;
    try {
      return typeof body === 'function' && body();
    } finally {
      const calls = api.target.calls.slice(callLength);
      api.target.calls.length = callLength;
      if (cont) {
        const last = api.target.calls[callLength-1];
        last.body += extractFnBody(body);
        util.append(last.calls, calls);
      } else api.target.calls.push({
        body: extractFnBody(body),
        calls,
      });
    }
  }

  function addComment(api, entry) {
    const {currentComment} = api;
    if (currentComment) {
      entry.push(currentComment);
      api.currentComment = null;
    }
  }

  function onTestEnd(api, func) {
    const {test} = TH;
    let onEnd = test._apiOnEnd;
    if (! onEnd) {
      onEnd = test._apiOnEnd = function run() {
        const callbacks = run.callbacks;
        if (callbacks.length === 0)
          return;

        run.callbacks = [];
        callbacks.forEach(cb => cb());
      };
      onEnd.callbacks = [];
      test.onEnd(onEnd);
    }

    onEnd.callbacks.push(func);
  }

  function inspect(obj) {
    if (typeof obj !== 'object' || obj === null ||
        obj.$inspect || ('outerHTML' in obj) || obj.nodeType === 3)
      return util.inspect(obj, 4, 150);

    const coreDisplay = obj && API._coreDisplay.get(obj.constructor);
    if (coreDisplay) return coreDisplay;

    let keys = Object.keys(obj).sort();
    if (keys.length > 20)
      keys = keys.slice(0, 20);

    const display = keys.map(key => {
      const item = obj[key];
      if (/[^$\w]/.test(key))
        key = JSON.stringify(key);
      const resolveFunc = item && API._resolveFuncs.get(item.constructor);
      return `${key}: ${resolveFunc ? resolveFunc('Oi', item)[1]
: util.inspect(item, 3, 150)}`;});
    return `{${display.join(", ").slice(0, 150)}}`;
  }

  API._docComment = docComment;
  module.exports = API;
  require('koru/env!./api')(API);
});
