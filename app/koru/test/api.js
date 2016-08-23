define(function(require, exports, module) {
  const koru    = require('koru');
  const util    = require('koru/util');
  const TH      = require('./main');

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
        this.currentComment = this.lastMethod =
        this.propertyName = this.initInstExample =
        this.initExample = undefined;

      this.methods = Object.create(null);
      this.protoMethods = Object.create(null);
      this.innerSubjects = Object.create(null);
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
      } else if (typeof subjectModule === 'string') {
        subjectModule = module.get(subjectModule);
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
    static property(name, options) {this.instance.property(name, options)}
    static protoProperty(name, options) {this.instance.protoProperty(name, options)}
    static comment(comment) {this.instance.comment(comment)}
    static example(body) {this.instance.example(body)}
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
        ThisAPI._moduleMap.set({
          id: this.id +
            (propertyName ? '.' : '::') +
            subjectName
        }, ans);
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
        api.lastMethod = api.newInstance = {
          test,
          sig,
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

    protoProperty(name, options, subject=this.subject.prototype) {
      return property(this, 'protoProperties', subject, name, options);
    }

    property(name, options) {
      return property(this, 'properties', this.subject, name, options);
    }

    comment(comment) {
      this.currentComment = comment;
    }

    example(body) {
      if (! this.lastMethod)
        throw new Error("API.(proto)method has not been called!");
      const callLength = this.lastMethod.calls.length;
      try {
        body();
      } finally {
        const calls = this.lastMethod.calls.slice(callLength);
        this.lastMethod.calls.length = callLength;
        this.lastMethod.calls.push({
          body: extractFnBody(body),
          calls,
        });
      }
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
      const {methods, protoMethods, abstract} = this;

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

      const id = this.testModule.id.replace(/-test$/, '');

      const ans = {
        id,
        subject: {
          name: this.subjectName,
          abstract,
        },
        methods,
        protoMethods,
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
        return ['F', obj, obj.name || funcToSig(obj)];
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
        switch(value[0]) {
        case 'M':
          return ['M', this.bestId(value[1])];
        case 'O':
          let api =  this.constructor.valueToApi(value[1]);
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

  API._resolveFuncs = new Map([
    [module.constructor, (type, value) => {
      if (type === 'Oi')
        return [type, `{Module:${value.id}}`, 'Module'];
      return [type, value.name, 'Module'];
    }],

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
    example(body) {body();}
    method() {}
    protoMethod() {}
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
    return body.toString().replace(/^.*{(\s*\n)?/, '').replace(/}\s*$/, '');
  }

  function funcToSig(func) {
    let code = func.toString();

    let m = /^function\s*(?=\w)/.exec(code);
    if (m)
      code = code.slice(m[0].length);

    m = /^class[^{]*\{[\s\S]*constructor\s*(\([^\)]*\))\s*\{/.exec(code);
    if (m) return `constructor${m[1]}`;

    m = /^([^(]+\([^\)]*\))\s*\{/.exec(code);

    if (m)
      return m[1];

    m = /^(\([^\)]*\)|\w+)\s*=>/.exec(code);

    if (! m)
    throw new Error("Can't find signature of "+code);

    return m[1] += ' => {/*...*/}';
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
      if (desc && (desc.get || desc.set)) {
        const calls = property.calls || (property.calls = []);
        const {subject} = api;
        Object.defineProperty(subject, name, {
          get() {
            const entry = [[], null];
            addComment(api, entry);
            calls.push(entry);
            const ans = desc.get.call(this);
            entry[1] = api.valueTag(ans);
            return ans;
          },
          set(value) {
            const entry = [[api.valueTag(value)], undefined];
            addComment(api, entry);
            calls.push(entry);
            desc.set.call(this, value);
          }
        });

        onTestEnd(api, () => Object.defineProperty(subject, name, desc));

      } else {
        property.value = api.valueTag(value);
      }
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
      default:
        throw new Error("invalid options supplied for property "+name);
      }
    }
  }

  function method(api, methodName, obj, methods) {
    const {test} = TH;
    const func = obj[methodName];
    if (! func)
      throw new Error(`method "${methodName}" not found`);

    let details = methods[methodName];
    const calls = details ? details.calls : [];
    if (! details) {
      details = api.lastMethod = methods[methodName] = {
        test,
        sig: funcToSig(func).replace(/^function\s*(?=\()/, methodName),
        intro: docComment(test.func),
        subject: api.valueTag(api.subject),
        calls
      };
    }

    const desc = koru.replaceProperty(obj, methodName, {
      value: function (...args) {
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
        Object.defineProperty(obj, methodName, desc);
      } else {
        delete obj[methodName];
      }
    });
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

    let keys = Object.keys(obj).sort();
    if (keys.length > 20)
      keys = keys.slice(0, 20);

    const display = keys.map(key => {
      const item = obj[key];
      if (/[^$\w]/.test(key))
        key = JSON.stringify(key);
      let resolveFunc = item && API._resolveFuncs.get(item.constructor);
      return `${key}: ${resolveFunc ?
resolveFunc('Oi', item)[1] :
util.inspect(item, 3, 150)}`;
    });
    return `{${display.join(", ").slice(0, 150)}}`;
  }

  API._docComment = docComment;
  module.exports = API;
  require('koru/env!./api')(API);
});
