define(function(require, exports, module) {
  const koru    = require('koru');
  const util    = require('koru/util');
  const TH      = require('./main');

  const ctx = module.ctx;

  class API {
    constructor(parent, moduleOrSubject, subjectName, subjectModules) {
      this.parent = parent;
      if (parent) {
        this.module = undefined;
        this.subject = moduleOrSubject;
      } else {
        this.module = moduleOrSubject;
        this.subject = moduleOrSubject && moduleOrSubject.exports;
      }
      this.subjectName = subjectName;
      this.subjectModules = subjectModules;

      this.newInstance = this.properties =
        this.currentComment = this.lastMethod =
        this.propertyName =
        this.initExample = this.abstract = undefined;

      this.methods = Object.create(null);
      this.protoMethods = Object.create(null);
      this.innerSubjects = Object.create(null);
    }

    static reset() {
      this.__afterTestCase = new WeakSet;
      this._apiMap = new Map;
      this._instance = null;
      this._objCache = new Map;
    }

    static module(module, subjectName, subjectModules) {
      const tc = TH.test._currentTestCase;
      if (module == null) {
        module = ctx.modules[toId(tc)];
      }
      const subject = module.exports;
      if (! this.isRecord) {
        this._instance.subject = subject;
        return this._instance;
      }

      this._instance = this._apiMap.get(subject);
      if (this._instance) return;

      const afterTestCase = this.__afterTestCase;
      afterTestCase.has(tc) || tc.after(testCaseFinished.bind(this));
      afterTestCase.add(tc);

      this._apiMap.set(subject, this._instance =
                       new this(null, module, subjectName || createSubjectName(subject, tc),
                               subjectModules || ctx.exportsModule(subject)));
      return this._instance;
    }

    static innerSubject(subject, subjectName, options) {return this.instance.innerSubject(subject, subjectName, options)}
    static new() {return this.instance.new()}
    static property(name, options) {this.instance.property(name, options)}
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
        return resolveFunc(relType(orig, value), displayName, orig);

      if (this._coreTypes.has(value))
        return [relType(orig, value), displayName, value.name];

      let api = this._apiMap.get(value);
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
        let api = this._apiMap.get(proto);
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

    get moduleName() {
      if (this.module)
        return this.module.id;
      const {parent} = this;
      return parent.moduleName +
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
      ans || ThisAPI._apiMap.set(
        subject,
        this.innerSubjects[subjectName] = ans =
          new ThisAPI(this, subject, subjectName)
      );


      if (propertyName) ans.propertyName = propertyName;
      if (options) {
        if (options.abstract) {
          if (ans.subjectModules)
            throw new Error("Absract already supplied");
          ans.subjectModules = [{id: ans.moduleName}];
          ans.abstract = typeof options.abstract === 'string' ?
            options.abstract :
            docComment(options.abstract);
        }

        if (options.initExample)
          ans.initExample = options.initExample;
      }
      return ans;
    }

    new() {
      const api = this;
      const {test} = TH;
      const calls = [];

      if (! api.newInstance) {
        api.lastMethod = api.newInstance = {
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
      inner(name, options,
            Object.getOwnPropertyDescriptor(this.subject, name),
            this.subject[name],
            this.properties || (this.properties = {}));

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
      const {methods, protoMethods} = this;
      let abstracts;
      const ids = (this.subjectModules||[]).map(m => m.id);
      if (this.parent) {
        abstracts = [this.abstract];
      } else {
        abstracts = ids.map(id => {
          const mod = ctx.modules[id+'-test'];
          if (mod && mod.body)
            return docComment(mod.body);
        });
      }

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

      const ans = {
        subject: {
          ids,
          name: this.subjectName,
          abstracts,
        },
        methods,
        protoMethods,
      };

      if (this.initExample) ans.initExample = extractFnBody(this.initExample);

      const {newInstance, properties} = this;
      if (newInstance) {
        newInstance.test = newInstance.test.name;
        newInstance.calls = serializeCalls(this, newInstance.calls);
        ans.newInstance = newInstance;
      }
      if (properties) {
        serializeProperties(this, properties);
        ans.properties = properties;
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
    [module.constructor, (type, _, value) => {
      if (type === 'Oi')
        return [type, `{Module:${value.id}}`, 'Module'];
      return [type, value.name, 'Module'];
    }]
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

  API._docComment = docComment;
  module.exports = API;
  require('koru/env!./api')(API);
});
