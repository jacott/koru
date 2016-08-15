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
    returns(api, row, argMap) {
       const m = /^\w+\s*({[^}]+})?(?:\s*-)?\s*([\s\S]*)$/.exec(row);
      if (! m)
        koru.error(`Invalid param for api: ${api.id} line @${row}`);
      const profile = argMap[':return:'] || (argMap[':return:'] = {});
      if (m[2]) profile.info = m[2];
      if (m[1]) overrideTypes(profile, m[1].slice(1,-1));
    }
  };

  BLOCK_TAGS.arg = BLOCK_TAGS.param;
  BLOCK_TAGS.argument = BLOCK_TAGS.param;
  BLOCK_TAGS.return = BLOCK_TAGS.returns;

  const INLINE_TAGS = {
    module(api, data) {
      return idToLink(data);
    },

    method(api, data) {
      return Dom.h({a: data+'()', $href: `#${api.id}:${data}`});
    }
  };

  const INLINE_TAG_RE = /(\{@\w+\s*[^}]*\})/;
  const INLINE_TAG_PARTS_RE = /\{@(\w+)\s*([^}]*)\}/;

  const hrefMap = {
    Module: 'https://www.npmjs.com/package/yaajs#api_Module',
  };

  function overrideTypes(profile, typeArg) {
    const oldTypes = profile.types;
    const types = profile.types = {};
    typeArg.split('|').forEach(type => {
      types[type] = oldTypes[type] || type;
    });
  }


  function execInlineTag(api, tagName, data) {
    const tag = INLINE_TAGS[tagName];
    return tag ? tag(api, data) : document.createTextNode(`{@${tagName} ${data}}`);
  }

  function noContent(tag) {
    return function (opts) {
      const attrs = {[tag]: ''};
      for (const attr in opts)
        attrs['$'+attr] = opts[attr];
      return Dom.h(attrs);
    };
  }

  module.exports = toHtml;

  function toHtml(title, json, sourceHtml) {
    const index = document.createElement();

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

    Object.keys(json).sort().forEach(id => {
      const api = json[id]; api.id = id;
      const {subject, newInstance, properties, methods, protoMethods, innerSubjects} = api;
      const requireLine = Dom.h({class: 'jsdoc-require highlight', div: [
        hl('const', 'kd'), ' ', hl(subject.name, 'nx'), ' ', hl('=', 'o'), ' ',
        hl('require', 'k'), '(', hl(`"${id}"`, 's'), ');'
      ]});

      const idIdx = subject.ids.length ? subject.ids.indexOf(id) : 0;

      const constructor = newInstance && buildConstructor(api, subject, newInstance, requireLine);
      let functions = [];
      util.isObjEmpty(methods) ||
        (functions = functions.concat(buildMethods(api, subject, methods, requireLine)));
      util.isObjEmpty(protoMethods) ||
        (functions = functions.concat(buildMethods(api, subject, protoMethods, requireLine, 'proto')));

      const linkNav = {nav: [constructor, ...functions].map(func => func && Dom.h({a: func.$name, $href: '#'+func.id}))};

      links.appendChild(Dom.h({class: 'jsdoc-nav-module', div: [
        idToLink(id),
        linkNav,
      ]}));
      pages.appendChild(Dom.h({
        id: id,
        class: "jsdoc-module",
        section: [
          {class: 'jsdoc-module-title', h2: subject.name},
          {abstract: jsdocToHtml(api, subject.abstracts[idIdx])},
          {div: [
            constructor,
            properties && buildProperties(api, subject, properties),
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

  function buildProperties(api, subject, properties) {
    const rows = [];
    addRows(properties);

    function addRows(properties) {
      const argMap = {};
      for (const name in properties) {
        const property = properties[name];
        const info = jsdocToHtml(api, property.info, argMap);
        rows.push({tr: [
          {td: name},
          {class: 'jsdoc-info', td: info}
        ]});

        property.properties && addRows(property.properties);
      }
    }

    return {class: 'jsdoc-properties', div: [
      {h5: 'Properties'},
      {table: {tbody: rows}}
    ]};
  }

  function buildConstructor(api, subject, {sig, intro, calls}, requireLine) {
    const {args, argMap} = mapArgs(sig, calls);
    const examples = calls.length && {div: [
      {h6: "Example"},
      {class: 'jsdoc-example highlight', pre: [
        requireLine.cloneNode(true),
        ...calls.map(call => Dom.h({
          div: Array.isArray(call) ?
            newSig(subject.name, call[0]) : codeToHtml(call.body)
        }))
      ]},
    ]};
    return section(api, {$name: 'constructor', div: [
      {h4: sig.replace(/^[^(]*/, 'constructor')},
      {abstract: jsdocToHtml(api, intro, argMap)},
      buildParams(api, args, argMap),
      examples,
    ]});
  }

  function newSig(name, args) {
    return `new ${name}(${args.map(arg => valueToText(arg)).join(", ")});`;
  }

  function buildMethods(api, subject, methods, requireLine, proto) {
    if (proto) {
      var needInit = true;
      var initInst = function () {
        if (! needInit) return [];
        needInit = false;
        return [
          {div: `const ${inst} = ${newSig(subject.name, subject.newInstance ? subject.newInstance.calls[0][0] : [])}`}
        ];
      };
      var inst = subject.instanceName || subject.name[0].toLowerCase() + subject.name.slice(1);
      var sigJoin = '#';
    } else {
      var initInst = () => [];
      var inst = subject.name;
      var sigJoin = '.';
    }
    return Object.keys(methods).map(name => {
      const {sig, intro, calls} = methods[name];
      const {args, argMap} = mapArgs(sig, calls);
      const ret = argProfile(calls, function (call) {return call[1]});
      if (! util.isObjEmpty(ret.types))
        argMap[':return:'] = ret;

      const examples = calls.length && {
        div: [
          {h6: "Example"},
          {class: 'jsdoc-example', pre: [
            requireLine.cloneNode(true),
            ...calls.map(call => Array.isArray(call) ? {div: [
              ...initInst(),
              {class: 'jsdoc-example-call highlight', div: [
                {div: [hl(inst, 'nx'), '.', hl(name, 'na'),
                       '(', ...hlArgList(call[0]), ');']},
                call[1] && {class: 'jsdoc-returns c1',
                            span: [' // returns ', valueToHtml(call[1])]}
              ]}
            ]} : {class: 'jsdoc-example-call jsdoc-code-block', div: codeToHtml(call.body)}),
          ]}
        ]};


      const abstract = jsdocToHtml(api, intro, argMap);
      const params = buildParams(api, args, argMap);

      return section(api, {
        $name: proto ? '#'+name : name, div: [
          {h5: `${subject.name}${sigJoin}${sig}`},
          {abstract},
          params,
          examples,
        ]
      });
    });
  }

  function section(api, div) {
    div.id = `${api.id}:${div.$name}`;
    div.class = `${div.class||''} jsdoc-module-section`;
    return div;
  }

  function codeToHtml(codeIn) {
    return jsParser.highlight(codeIn);
  }

  function mapArgs(sig, calls) {
    sig = '1|{_x_'+sig.replace(/^function\s*/, '')+' {}}';
    const args = jsParser.extractParams(sig);
    const argMap = {};
    args.forEach((arg, i) => argMap[arg] = argProfile(calls, call => call[0][i]));
    return {args, argMap};
  }

  function buildParams(api, args, argMap) {
    const ret = argMap[':return:'];

    if (args.length === 0 && ! ret)
      return;


    const retTypes = ret && extractTypes(ret);
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
          ret && {
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

  function extractTypes(am) {
    const types = [];
    const typeMap = {};
    for (const type in am.types) {
      if (typeMap[am.types[type]]) continue;
      typeMap[am.types[type]] = true;
      if (types.length)
        types.push('\u00a0or', {br: ''});
      types.push({a: am.types[type], $href: am.href(type)});
    }
    return types;
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
                value = entry[entry.length-1];
                types[`<${entry[0]}>${entry[entry.length-1]}`] = value;
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
      return hrefMap[type] || '#'+type;
    }

    if (type.startsWith('...'))
      type = type.slice(3);

    return hrefMap[type] || `https://developer.mozilla.org/en-US/docs/Glossary/${util.capitalize(type)}`;
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

    info.split(/(<[^>]*>)/).forEach(part => {
      if (part[0] === '<' && part[part.length-1] === '>')
        div.appendChild(Dom.h({span: part.slice(1,-1), class: 'jsdoc-param'}));
      else {
        part.split(INLINE_TAG_RE).forEach(p2 => {
          const m = INLINE_TAG_PARTS_RE.exec(p2);
          if (m) {
            div.appendChild(execInlineTag(api, m[1], m[2]));
          } else
            markdown(div, p2);
        });
      }
    });
    return div;
  }

  toHtml.markdown = markdown;

  const mdRenderer = new marked.Renderer();
  const mdOptions = {renderer: mdRenderer};

  function markdown(div, text) {
    if (! text) return;

    if (text.endsWith('\n'))
      text=text.slice(0, -1)+' \n';
    const tokens = marked.lexer('x '+text, {});
    const oneToken = tokens.length === 1;
    const html = '<p>'+marked.parser(tokens).slice(5);
    const nodes = oneToken ? [Dom.html(html)] : Dom.html(`<div>${html}</div>`).childNodes.slice(0);

    const fcs = nodes[0].childNodes.slice(0);
    if (fcs[0] && fcs[0].textContent)
      div.appendChild(fcs[0]);
    for(let i = 1; i < fcs.length; ++i) {
      div.appendChild(fcs[i]);
    }

    for(let i = 1; i < nodes.length; ++i) {
      div.appendChild(nodes[i]);
    }
  }

  function hl(text, hl) {
    const span = document.createElement('span');
    span.className = hl;
    span.textContent = text;
    return span;
  }

  function idToLink(id) {
    return Dom.h({a: id.replace(/\/main$/, ''), class: "jsdoc-idLink", $href: '#'+id});
  }
});
