define(function(require, exports, module) {
  const marked = requirejs.nodeRequire('marked');
  const koru     = require('koru');
  const Dom      = require('koru/dom');
  const htmlDoc  = require('koru/dom/html-doc');
  const jsParser = require('koru/parse/js-parser');
  const util     = require('koru/util');

  const meta = noContent('meta');
  const link = noContent('link');
  const script = noContent('script');
  const async = 'async';

  const mdRenderer = new marked.Renderer();
  const mdOptions = {renderer: mdRenderer};

  const CORE_TYPES = {
    Array: true,
    ArrayBuffer: true,
    Boolean: true,
    Date: true,
    Element: 'Web/API',
    Error: true,
    EvalError: true,
    Float32Array: true,
    Float64Array: true,
    Function: true,
    Int16Array: true,
    Int32Array: true,
    Int8Array: true,
    Map: true,
    Math: true,
    Null: true,
    Number: true,
    Object: true,
    Primitive: 'Glossary',
    Promise: true,
    RangeError: true,
    ReferenceError: true,
    RegExp: true,
    Set: true,
    String: true,
    Symbol: true,
    SyntaxError: true,
    TypeError: true,
    Uint16Array: true,
    Uint32Array: true,
    Uint8Array: true,
    Uint8ClampedArray: true,
    Undefined: true,
    URIError: true,
    WeakMap: true,
    WeakSet: true,
  };

  const BLOCK_TAGS = {
    param(api, row, argMap) {
      const m = /^\w+\s*({[^}]+})?\s*(\[)?(\w+)\]?(?:\s*-)?\s*([\s\S]*)$/.exec(row);
      if (! m)
        koru.error(`Invalid param for api: ${api.id} line @${row}`);
      const profile = argMap[m[3]] || (argMap[m[3]] = {});
      if (m[4]) profile.info = m[4];
      if (m[2]) profile.optional = true;
      if (m[1]) overrideTypes(profile, m[1].slice(1,-1));
    },
    config(api, row, argMap) {
       const m = /^\w+\s*(\S+)(?:\s*-)?\s*([\s\S]*)$/.exec(row);
      if (! m)
        koru.error(`Invalid config for api: ${api.id} line @${row}`);
      const profile = argMap[':config:'] || (argMap[':config:'] = {});
      profile[m[1]] = jsdocToHtml(api, m[2], argMap);
    },
    returns(api, row, argMap) {
      const m = /^\w+\s*({[^}]+})?(?:\s*-)?\s*([\s\S]*)$/.exec(row);
      if (! m)
        koru.error(`Invalid returns for api: ${api.id} line @${row}`);
      const profile = argMap[':return:'] || (argMap[':return:'] = {});
      if (m[2]) profile.info = m[2];
      if (m[1]) overrideTypes(profile, m[1].slice(1,-1));
    },
  };

  BLOCK_TAGS.arg = BLOCK_TAGS.param;
  BLOCK_TAGS.argument = BLOCK_TAGS.param;
  BLOCK_TAGS.return = BLOCK_TAGS.returns;

  const hrefMap = {
    Module: 'https://www.npmjs.com/package/yaajs#api_Module',
  };

  function overrideTypes(profile, typeArg) {
    const oldTypes = profile.types;
    const types = profile.types = {};
    typeArg.split('|').forEach(type => {
      types[type] = (oldTypes && oldTypes[type]) || type;
    });
  }


  function execInlineTag(api, text) {
    let [mod, type, method] = text.split(/([.#])/);
    let href = text;
    if (mod) {
      const destMod = mod && api.parent && api.parent[mod];
      if (destMod)
        mod = mod.replace(/\/[^/]*$/, '/'+destMod.subject.name);
      text = `${mod}${type||''}${method||''}`;
    } else {
      href = api.id+href;
    }

    return Dom.h({class: 'jsdoc-link', a: idToText(text), $href: '#'+href});
  }

  function noContent(tag) {
    return function (opts) {
      const attrs = {[tag]: ''};
      for (let attr in opts)
        attrs['$'+attr] = opts[attr];
      return Dom.h(attrs);
    };
  }

  function apiToHtml(title, json, sourceHtml) {
    const index = document.createElement('div');

    index.innerHTML = sourceHtml;

    const tags = {};

    Dom.walkNode(index, node => {
      switch(node.nodeType) {
      case document.TEXT_NODE: case document.COMMENT_NODE:
        return false;
      default:
        const tag = node.getAttribute('data-api');
        if (tag) tags[tag] = node;
      }
    });

    const {header, links, pages} = tags;
    const linkModules = [];

    Object.keys(json).sort((a,b)=>{
      a = a.replace(/\/main$/, '');
      b = b.replace(/\/main$/, '');
      return a === b ? 0 : a < b ? -1 : 1;
    }).forEach(id => {
      const api = json[id]; api.id = id; api.parent = json;
      const {subject, newInstance, methods, customMethods, protoMethods, innerSubjects} = api;

      const aside = [];
//      addModuleList('Modules required', api.requires);
      addModuleList('Modifies modules', api.modifies);
      addModuleList('Modified by modules', api.modifiedBy);

      function addModuleList(heading, list) {
        if (list) {
          aside.push({div: [
            {h5: heading},

            {class: 'jsdoc-list', div: list.map(id => {
              const m = id.split('!');
              if (m.length === 2) {
                if (m[0] === 'koru/env') {
                  const idc = m[1]+'-client';
                  const ids = m[1]+'-server';
                  return {span: [
                    {class: 'jsdoc-link', a: idc, $href: '#'+idc},
                    {br: ''},
                    {class: 'jsdoc-link', a: ids, $href: '#'+ids},
                  ]};
                }
                return id;
              }
              return {class: 'jsdoc-link', a: id, $href: '#'+id};
            })},
          ]});
        }
      }

      const idParts = /^([^:.]+)([.:]*)(.*)$/.exec(id);
      const reqParts = [
        hl('const', 'kd'), ' ', hl(subject.name, 'nx'), ' ', hl('=', 'o'), ' ',
        hl('require', 'k'), '(', hl(`"${idParts[1]}"`, 's'), ')'
      ];
      switch (idParts[2]) {
      case '.':
        reqParts.push('.', hl(idParts[3], 'na'));
        break;
      case '::':
        const ref = json[idParts[1]];
        if (ref)
          reqParts[2].textContent = ref.subject.name;
      }
      reqParts.push(';');
      const requireLine = Dom.h({class: 'jsdoc-require highlight', div: reqParts});

      const functions = newInstance ? [buildConstructor(
        api, subject, newInstance, requireLine
      )] : [];

      util.isObjEmpty(customMethods) ||
        util.append(functions, buildMethods(api, subject, customMethods, requireLine, 'custom'));
      util.isObjEmpty(methods) ||
        util.append(functions, buildMethods(api, subject, methods, requireLine));
      util.isObjEmpty(protoMethods) ||
        util.append(functions, buildMethods(api, subject, protoMethods, requireLine, 'proto'));

      const linkNav = {nav: functions.map(
        func => func && Dom.h({a: func.$name, $href: '#'+func.id})
      )};

      linkModules.push([id, linkNav]);
      const abstractMap = {};
      const abstract = jsdocToHtml(api, subject.abstract, abstractMap);
      const configMap = abstractMap[':config:'];
      if (configMap) {
        var config = {class: 'jsdoc-config', table: [
          {tr: {$colspan: 2, td: {h5: 'Config'}}},
          ...Object.keys(configMap).sort().map(key => Dom.h({
            class: 'jsdoc-config-item',
            tr: [{td: key}, {td: configMap[key]}]
          }))
        ]};
      }

      let properties = util.isObjEmpty(api.properties) ? [] :
            buildProperties(api, subject, api.properties);

      util.isObjEmpty(api.protoProperties) ||
        (properties = properties.concat(
          properties, buildProperties(api, subject, api.protoProperties, 'proto')));

      pages.appendChild(Dom.h({
        id,
        '$data-env': env(api),
        class: /::/.test(id) ? "jsdoc-module jsdoc-innerSubject" : "jsdoc-module",
        section: [
          {class: 'jsdoc-module-path', a: id, $href: '#'+id},
          {class: 'jsdoc-module-title', h2: subject.name},
          {abstract},
          {class: 'jsdoc-module-sidebar', aside},
          {div: [
            config,
            properties.length && {class: 'jsdoc-properties', div: [
              {h5: 'Properties'},
              {table: {tbody: properties}}
            ]},
            functions.length && {class: 'jsdoc-methods', div: [
              {h4: "Methods"},
              {div: functions},
            ]},
            innerSubjects && buildInnerSubjects(api, innerSubjects, linkNav),
          ]},
          // {pre: JSON.stringify(json, null, 2)}
        ],
      }));
    });

    buildLinks(links, linkModules);

    return index.innerHTML;
  };

  function buildInnerSubjects(parent, innerSubjects, linkNav) {
    return {
      class: 'jsdoc-inner-subjects',
      div: Object.keys(innerSubjects).sort().map(name => {
        const api = innerSubjects[name];
      }),
    };
  }

  function buildProperties(api, subject, properties, proto) {
    const rows = [];
    addRows(properties);

    function addRows(properties) {
      const argMap = {};
      Object.keys(properties).sort().forEach(name => {
        const property = properties[name];
        const value = Dom.h({class: 'jsdoc-value', code: valueToText(property.value)});
        const info = property.info ? jsdocToHtml(
          api,
          property.info
            .replace(/\$\{value\}/, '[](#jsdoc-value)'),
          argMap
        ) : value;
        if (property.info) {
          const vref = findHref(info, '#jsdoc-value', true);
          if (vref)
            vref.parentNode.replaceChild(value, vref);
        }
        const ap = extractTypes(
          property.calls ?
            argProfile(property.calls, call => call[0].length ? call[0][0] : call[1])
          : argProfile([[property.value]], value => value[0])
        );

        rows.push({tr: [
          {td: proto ? '#'+name : name},
          {td: ap},
          {class: 'jsdoc-info', '$data-env': env(property),
           td: info
           }
        ]});

        property.properties && addRows(property.properties);
      });
    }

    return rows;
  }

  function env(obj) {return obj.env || 'server';}

  function buildConstructor(api, subject, {sig, intro, calls}, requireLine) {
    const {args, argMap} = mapArgs(sig, calls);
    const examples = calls.length && {div: [
      {h6: "Example"},
      {class: 'jsdoc-example highlight', pre: [
        requireLine.cloneNode(true),
        ...calls.map(call => Dom.h({
          div: codeToHtml(Array.isArray(call) ?
                          newSig(subject.name, call[0]) :
                          call.body)
        }))
      ]},
    ]};
    return section(api, {$name: 'constructor', div: [
      {h4: defToHtml(sig)},
      {abstract: jsdocToHtml(api, intro, argMap)},
      buildParams(api, args, argMap),
      examples,
    ]});
  }

  function newSig(name, args) {
    return `new ${name}(${args.map(arg => valueToText(arg)).join(", ")});`;
  }

  function buildMethods(api, subject, methods, requireLine, type) {
    return Object.keys(methods).sort().map(name => {
      const method = methods[name];
      const {sig, intro, calls} = method;
      let initInst, needInit = false;
      if (type === 'proto') {
        needInit = calls.reduce((s, i)=> s || i.body === undefined, false);
        initInst = ()=>{
          if (! needInit) return [];
          needInit = false;
          const mu = codeToHtml(
            api.initInstExample || `const ${inst} = ${newSig(subject.name, subject.newInstance ? subject.newInstance.calls[0][0] : [])}`
          );
          mu.classList.add('jsdoc-inst-init');
          return [mu];
        };
        var inst = subject.instanceName || subject.name[0].toLowerCase() + subject.name.slice(1);
        var sigJoin = '#';
      } else {

        if (api.initExample) {
          needInit = true;
          initInst = () => {
            if (! needInit) return [];
            needInit = false;
            const mu = codeToHtml(api.initExample);
            mu.classList.add('jsdoc-init');
            return [mu];
          };
        } else
          initInst = () => [];
        var inst = subject.name;
        var sigJoin = type !== 'custom' && '.';
      }
      const {args, argMap} = mapArgs(sig, calls);
      const ret = argProfile(calls, call => call[1]);
      if (! util.isObjEmpty(ret.types))
        argMap[':return:'] = ret;

      const examples = calls.length && {div: [
        {h6: "Example"},
        {class: 'jsdoc-example', pre: [
          requireLine.cloneNode(true),
          ...initInst(),
          ...calls.map(call => Array.isArray(call) ? [
            {class: 'jsdoc-example-call highlight', div: [
              {div: [hl(inst, 'nx'), '.', hl(name, 'na'),
                     '(', ...hlArgList(call[0]), ');']},
              (call[2] || call[1]) === undefined || {
                class: 'jsdoc-returns c1',
                span: call[2] ? ` // ${call[2]}` : [' // returns ', valueToHtml(call[1])]}
            ]}
          ] : {class: 'jsdoc-example-call jsdoc-code-block', div: codeToHtml(call.body)}),
        ]}
      ]};


      const abstract = jsdocToHtml(api, intro, argMap);
      const params = buildParams(api, args, argMap);

      return section(api, {
        '$data-env': env(method),
        $name: (type === 'proto' ? '#'+name : name), div: [
          {h5: sigJoin ? [`${subject.name}${sigJoin}`, defToHtml(sig)] : defToHtml(sig)},
          {abstract},
          params,
          examples,
        ]
      });
    });
  }

  function section(api, div) {
    div.id = `${api.id}${div.$name[0]==='#' ? '' : '.'}${div.$name}`;
    div.class = `${div.class||''} jsdoc-module-section`;
    return div;
  }

  const defToHtml = (sig)=>{
    const elm = jsParser.highlight(`function _${sig} {}`, 'span');
    elm.removeChild(elm.firstChild);
    elm.removeChild(elm.firstChild);
    elm.firstChild.textContent = elm.firstChild.textContent.slice(1);
    elm.lastChild.textContent = elm.lastChild.textContent.slice(0, -3);
    return elm;
  };


  function codeToHtml(codeIn) {
    return jsParser.highlight(codeIn);
  }

  function mapArgs(sig, calls) {
    const args = jsParser.extractParams(sig);
    const argMap = {};
    args.forEach((arg, i) => argMap[arg] = argProfile(calls, call => call[0][i]));
    return {args, argMap};
  }

  function buildParams(api, args, argMap) {
    const ret = argMap[':return:'];

    if (args.length === 0 && ret === undefined)
      return;

    const retTypes = ret && ret.types && extractTypes(ret);
    return {class: "jsdoc-args", div: [
      {h6: "Parameters"},
      {table: {
        tbody: [
          ...args.map(arg => {
            const am = argMap[arg];
            const types = extractTypes(am);
            return {
              class: "jsdoc-arg", tr: [
                {td: am.optional ? `[${arg}]` : arg},
                {td: types},
                {class: 'jsdoc-info', td: jsdocToHtml(api, am.info)}
              ]
            };
          }),
          ret && retTypes && {
            class: "jsdoc-method-returns", tr: [
              {td: {h6: 'Returns'}},
              {td: retTypes},
              {class: 'jsdoc-info', td: jsdocToHtml(api, ret.info)}
            ]
          }
        ],
      }},
    ]};
  }

  function extractTypes({types, href}) {
    const ans = [];
    const typeMap = {};
    for (let type in types) {
      if (typeMap[types[type]]) continue;
      typeMap[types[type]] = true;
      if (ans.length != 0)
        ans.push('\u200a/\u200a');
      ans.push(targetExternal({a: idToText(types[type]), $href: href(type)}));
    }
    return ans;
  }

  function idToText(id) {
    return id.replace(/\/main(?=$|\.)/, '').replace(/^.*\//, '');
  }

  function argProfile(calls, extract) {
    let optional = false;
    let types = {};

    function iterCalls(calls) {
      calls.forEach(call => {
        if (Array.isArray(call)) {
          const entry = extract(call);
          if (entry === undefined) {
            optional = true;
          } else {
            if (Array.isArray(entry)) {
              let value;
              switch (entry[0]) {
              case 'O':
                value = entry[1] === 'null' ? 'null' : 'object';
                break;
              case 'F': value = 'function'; break;
              case 'U': value = 'undefined'; break;
              default:
                types[`<${entry[0]}>${entry[entry.length-1]}`] = entry[entry.length-1];
                return;
              }
              types[value] = value;
              return;
            }
            if (entry === null)
              types['null'] = 'null';
            else
              types[typeof entry] = typeof entry;
          }
        } else
          iterCalls(call.calls);
      });
    }

    iterCalls(calls);

    return {optional, types, type: null, href: typeHRef};
  }

  function typeHRef(type) {
    if (type[0] === '<') {
      type = type.replace(/^[^>]*>(?:\.{3})?/, '');
      let ans = hrefMap[type];
      if (ans) return ans;
    }

    if (type.startsWith('...'))
      type = type.slice(3);

    const m = /^\[([-\w]+)(?:,\.\.\.)\]$/.exec(type);
    if (m)
      type = m[1];

    let ans = hrefMap[type];
    if (ans) return ans;
    const cType = util.capitalize(type);

    const ct = CORE_TYPES[cType] || type === 'any-type';
    if (ct)
      return 'https://developer.mozilla.org/en-US/docs/'+
      (ct === true ? 'Web/JavaScript/Reference/Global_Objects/' : ct+'/') +
      (type === 'any-type' ? '' : cType);
    return '#'+type;
  }

  function valueToHtml(arg) {
    const text = valueToText(arg);
    return hl(text, arg == null ? 'kc' : jsParser.HL_MAP[typeof arg] || 'ge nx');
  }

  function hlArgList(list) {
    const ans = [];
    list.forEach(arg => {
      if (ans.length !== 0)
        ans.push(", ");
      ans.push(valueToHtml(arg));
    });
    return ans;
  }

  function valueToText(arg) {
    if (Array.isArray(arg))
      return arg[1];
    else
      return JSON.stringify(arg);
  }

  function valueToLink(arg) {
    return valueToText(arg);
  }

  const targetExternal = (a)=> a.$href.indexOf("http") == 0 ? (a.$target="_blank", a) : a;

  function jsdocToHtml(api, text, argMap) {
    const div = document.createElement('div');
    const [info, ...blockTags] = (text||'').split(/[\n\r]\s*@(?=\w+)/);

    if (blockTags.length && argMap) {
      blockTags.forEach(row => {
        const tag = /^\w+/.exec(row);
        if (tag) {
          const tagFunc = BLOCK_TAGS[tag[0]];
          tagFunc && tagFunc(api, row, argMap);
        }
      });
    }

    mdRenderer.link = function (href, title, text) {
      switch (href) {
      case '#jsdoc-tag':
        return execInlineTag(api, text).outerHTML;
      default:
        const a = {a: text, $href: href};
        if (title) a.$title = title;
        return Dom.h(targetExternal(a)).outerHTML;
      }
    };


    const md = marked.parse(
      info.replace(/\{#([^}{]*)\}/g, '[$1](#jsdoc-tag)'),

      mdOptions
    );

    div.innerHTML = md;
    return div;
  }

  function hl(text, hl) {
    const span = document.createElement('span');
    span.className = hl;
    span.textContent = text;
    return span;
  }

  function buildLinks(parent, list) {
    let prevId = '', nodeModule;
    list.forEach(([id, linkNav]) => {
      const link = idToLink(id);
      (link.nodeType ? parent : nodeModule)
        .appendChild(nodeModule = Dom.h({class: 'jsdoc-nav-module', div: [
          link,
          linkNav,
        ]}));
      prevId = id;
    });

    function idToLink(id) {
      let text = id.replace(/\/main(?=\.|::|$)/, '').split(/([\/\.]|::)/);
      prevId = prevId.replace(/\/main(?=\.|::|$)/, '').split(/([\/\.]|::)/);
      const len = Math.min(text.length, prevId.length);
      for(var i = 0; i < len; ++i) {
        if (text[i] !== prevId[i]) break;
      }
      if (i === 0) {
        text = text.join('');
      } else {
        switch (text[i]) {
        case '::': case '.':
          return {a: text.slice(i).join(''), class: "jsdoc-idLink", $href: '#'+id};
        case '/': ++i;
        default:
          text = Dom.h({span: [
            {class: 'jsdoc-nav-spacer', span: new Array(i).join("\xa0")},
            text.slice(i).join('')
          ]});
        }
      }

      return Dom.h({a: text, class: "jsdoc-idLink", $href: '#'+id});
    }
  }

  function findHref(node, href, returnOnFirst) {
    let ans = returnOnFirst ? undefined : [];
    Dom.walkNode(node, node => {
      switch(node.nodeType) {
      case document.TEXT_NODE: case document.COMMENT_NODE:
        return false;
      default:
        if (node.tagName === 'A' && node.getAttribute('href') === href) {
          if (returnOnFirst) {
            ans = node;
            return true;
          } else
            ans.push(node);
        }
      }
    });

    return ans;
  }

  apiToHtml.jsdocToHtml = jsdocToHtml;
  module.exports = apiToHtml;
});
