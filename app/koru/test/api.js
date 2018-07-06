define((require, exports, module)=>{
  const koru            = require('koru');
  const moduleGraph     = require('koru/module-graph');
  const jsParser        = require('koru/parse/js-parser');
  const {stubName$}     = require('koru/symbols');
  const util            = require('koru/util');
  const TH              = require('./main');

  const onEnd$ = Symbol(), tcInfo$ = Symbol();

  const {hasOwn} = util;

  const {inspect$} = require('koru/symbols');

  const ctx = module.ctx;

  const Element = (isClient ? window : global).Element || {};

  const inspect = (obj)=>{
    if (typeof obj !== 'object' || obj === null ||
        obj[inspect$] || ('outerHTML' in obj) || obj.nodeType === 3)
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
      if (typeof resolveFunc === 'function')
        return `${key}: ${resolveFunc('Oi', item)[1]}`;
      if (typeof item === 'function' && item.name === key)
        return `${key}(){}`;

      return `${key}: ${util.inspect(item, 3, 150)}`;});
    return `{${display.join(", ").slice(0, 150)}}`;
  };

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
      this.abstract = docComment(this.testModule && this.testModule.body);

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

    static module({subjectModule, subjectName, initExample, initInstExample}={}) {
      const tc = TH.Core.currentTestCase;
      subjectModule = subjectModule || ctx.modules[toId(tc)];
      const subject = subjectModule.exports;
      if (! this.isRecord) {
        this._instance.tc = tc;
        this._instance.subject = subject;
        return this._instance;
      }
      subjectName = subjectName || createSubjectName(subject, tc);

      this._instance = this._moduleMap.get(subjectModule);
      if (this._instance == null) {
        const afterTestCase = this.__afterTestCase;
        afterTestCase.has(tc) || tc.topTestCase().after(()=>{this._instance = null});
        afterTestCase.add(tc);

        this._mapSubject(subject, subjectModule);
        this._moduleMap.set(
          subjectModule, this._instance = new this(
            null, subjectModule,
            subjectName,
            ctx.modules[tc.moduleId]
          )
        );
        if (initExample)
          this._instance.initExample = initExample;

        if (initInstExample)
          this._instance.initInstExample = initInstExample;
      }
      if (tc[tcInfo$] === undefined) {
        tc[tcInfo$] = true;
        if (this._instance.abstract === undefined) {
          const module = ctx.modules[tc.moduleId];
          if (module !== undefined)
            this._instance.abstract = docComment(module.body);
        }
      }

      return this._instance;
    }

    static innerSubject(subject, subjectName, options) {return this.instance.innerSubject(subject, subjectName, options)}
    static new(sig) {return this.instance.new(sig)}
    static custom(func, name, sig) {return this.instance.custom(func, name, sig)}
    static customIntercept(object, name, sig) {return this.instance.customIntercept(object, name, sig)}
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
      let propertyName;
      if (typeof subject === 'string') {
        propertyName = subject;
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
      const {test} = TH;
      const calls = [];

      switch(typeof sig) {
      case 'function':
        this.subject = sig;
      case 'undefined':
        if (typeof this.subject !== 'function' || Object.getPrototypeOf(this.subject) == null)
          throw new Error("this.new called on non function");

        sig = funcToSig(this.subject).replace(/^[^(]*/, 'constructor');
        break;
      }


      if (! this.newInstance) {
        this.newInstance = {
          test,
          sig,
          intro: docComment(test.func),
          calls
        };
      }

      this.target = this.newInstance;

      onTestEnd(this);

      return (...args)=>{
        const entry = [
          args.map(obj => this.valueTag(obj)),
          undefined,
        ];
        calls.push(entry);
        const ans = new this.subject(...args);
        entry[1] = this.valueTag(ans);
        return ans;
      };
    }

    custom(func, name=func.name, sig) {
      let sigPrefix;
      if (sig === undefined) {
        sig = funcToSig(func, name);
      } else {
        const m = /^([^=(]*?[.#:])/.exec(sig);
        if (m != null) {
          sigPrefix = m[1];
          if (sigPrefix === sig)
            sig = funcToSig(func, name);
          else
            sig = sig.slice(m[1].length);
        }
      }
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
        sigPrefix,
        sig,
        intro: docComment(test.func),
        calls
      };
      api.target = details;

      onTestEnd(api);

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

    customIntercept(func, name, sig) {
      const orig = func[name];
      TH.intercept(func, name, this.custom(orig, name, sig));
      return orig;
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
      TH.test[onEnd$] && TH.test[onEnd$]();
    }

    [inspect$]() {
      return `{API(${this.subjectName})}`;
    }

    serialize() {
      const {methods, protoMethods, customMethods, abstract} = this;

      const procMethods = list => {
        for (let methodName in list) {
          const row = list[methodName];
          list[methodName] = {
            test: row.test.name,
            sigPrefix: row.sigPrefix,
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
              if (oMod && moduleGraph.isRequiredBy(oMod, this.module))
                modifies.push(oId);
              else if (oMod && moduleGraph.isRequiredBy(this.module, oMod))
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

      if (typeof value === 'symbol')
        return ['S', 'symbol'];

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
    Element,
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

          const resolveFunc = item != null && typeof item === 'object'
                ? API._resolveFuncs.get(item.constructor) : undefined;
          if (resolveFunc !== undefined)
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
    new(sig) {
      const func = typeof sig === 'function'
            ? sig
            : (this.tc === TH.Core.currentTestCase || API.module(), this.subject);
      return (...args) => {
        return new func(...args);
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
  } else {
    TH.Core.onEnd(module, function () {
      if (API.isRecord) {
        API._record();
        API.reset();
      }
    });

    TH.Core.onTestEnd(test=>{API._instance = null});
  }

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
      return jsParser.indent(body);

    body = body.toString();

    const m = /^\([^)]*\)\s*=>\s*(?=[^{\s])/.exec(body);

    if (m) return  jsParser.indent(body.slice(m[0].length));

    return jsParser.indent(body.replace(/^.*{(\s*\n)?/, '').replace(/}\s*$/, ''));
  }

  const funcToSig = (func, name)=>{
    const sig = jsParser.extractCallSignature(func);
    return (name === undefined || name === func.name)
      ? sig : name+sig.slice(func.name.length);
  };

  function fileToCamel(fn) {
    return fn.replace(/-(\w)/g, (m, l) => l.toUpperCase())
      .replace(/^.*\//, '');
  }

  function docComment(func) {
    if (func == null) return;
    const code = func.toString();
    let m = /\)\s*(?:=>)?\s*{\s*/.exec(code);
    if (m == null) return;
    let re = /\/\*\*\s*([\s\S]*?)\s*\*?\*\//y;
    re.lastIndex = m.index+m[0].length;
    m = re.exec(code);
    return m == null ? undefined : m[1].slice(2).replace(/^\s*\* ?/mg, '');
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

  const property = (api, field, subject, name, options)=>{
    const {test} = TH;
    if (name == null) name = test.name.replace(/^.*test ([^\s.]+).*$/, '$1');

    const inner = (subject, name, options, properties)=>{
      const property = properties[name] || (properties[name] = {});

      const hasValueOpt =
            typeof options === 'object' && options !== null && hasOwn(options, 'value');

      const desc = subject && ! hasValueOpt
            ? Object.getOwnPropertyDescriptor(subject, name) : undefined;

      let savedValue = desc == null || desc.get == null ? subject[name] : undefined;

      if (hasValueOpt) {
        property.value = api.valueTag(options.value);
      } else if (desc == null || desc.get || desc.set) {
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
        property.value = api.valueTag(savedValue);
      }
      switch (typeof options) {
      case 'string':
        property.info = options;
        break;
      case 'function':
        property.info = options(savedValue);
        break;
      case 'object':
        if (options != null) {
          if (options.info) property.info = options.info;
          if (options.intro) property.info = options.intro;
          if (options.properties) {
            const properties = property.properties ||
                    (property.properties = {});
            for (let name in options.properties) {
              inner(savedValue, name, options.properties[name], properties);
            }
          }
          break;
        }
      case 'undefined':
        break;
      default:
        throw new Error("invalid options supplied for property "+name);
      }
      if (property.info === undefined) {
        property.info = docComment(TH.test.func);
      }
    };

    inner(subject, name, options, api[field] || (api[field] = {}));
  };

  function method(api, methodKey, obj, methods) {
    const {test} = TH;
    if (methodKey == null) {
      methodKey = test.name.replace(/^.*test ([^\s.]+).*$/, '$1');
    }
    const func = obj[methodKey];
    if (func == undefined)
      throw new Error(`method "${methodKey}" not found`);

    const methodName = methodKey.toString();
    let details = methods[methodName];
    const calls = details ? details.calls : [];
    if (! details) {
      let sig = funcToSig(func).replace(/^function\s*(?=\()/, methodName);
      if (! sig.startsWith(methodName)) {
        if (sig.startsWith('('))
          sig = methodName+sig.slice(0, jsParser.findMatch(sig, '('));
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
    if (test[onEnd$] === undefined) {
      const callLength = api.target === undefined ? 0 : api.target.calls.length;
      const onEnd = test[onEnd$] = ()=>{
        test[onEnd$] = undefined;
        const {callbacks} = onEnd;
        onEnd.callbacks = [];
        callbacks.forEach(cb => cb());
        const raw = test.func.toString();
        const re = /\/\/\[([\s\S]+?)\/\/\]/g;
        let m = re.exec(raw);
        if (m == null) return;
        let body = '';
        while (m !== null) {
          body += m[1].replace(/\bnew_/g, 'new ');
          m = re.exec(raw);
        }
        if (body !== '') {
          const calls = api.target.calls.slice(callLength);
          api.target.calls.length = callLength;
          body = jsParser.indent(body.replace(/^\s*\n/, ''));
          api.target.calls.push({body, calls});
        }
      };
      onEnd.callbacks = [];
      test.onEnd(onEnd);
    }

    func === undefined || test[onEnd$].callbacks.push(func);
  }

  API._docComment = docComment;
  require('koru/env!./api')(API);

  return API;
});
