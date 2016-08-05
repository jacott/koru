const fs = require('fs');
const path = require('path');
const {parse} = require('babylon');
const traverse = require('babel-traverse').default;

define(function(require, exports, module) {
  const koru    = require('koru');
  const Dom     = require('koru/dom');
  const htmlDoc = require('koru/dom/html-doc');
  const util    = require('koru/util');

  const OUT_DIR = path.resolve(module.toUrl('.'), '../../../../doc');

  const meta = noContent('meta');
  const link = noContent('link');
  const script = noContent('script');
  const async = 'async';

  function noContent(tag) {
    return function (opts) {
      const attrs = {[tag]: ''};
      for (const attr in opts)
        attrs['$'+attr] = opts[attr];
      return Dom.h(attrs);
    };
  }

  return function (title="Koru API") {
    const json = JSON.parse(fs.readFileSync(`${OUT_DIR}/api.json`));

    const index = document.createElement();
    index.innerHTML = fs.readFileSync(`${OUT_DIR}/api-template.html`).toString();

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
      const {newInstance, subject, methods} = json[id];
      const requireLine = {class: 'jsdoc-require', div: [`const ${subject.name} = require('`, idToLink(id),`');`]};

      const idIdx = subject.ids.indexOf(id);

      links.appendChild(idToLink(id));
      pages.appendChild(Dom.h({
        id: id,
        class: "mdl-layout__content",
        main: [
          {h2: subject.name},
          {abstract: jsdocToHtml(subject.abstracts[idIdx])},
          {div: [
            newInstance && buildConstructor(id, subject, newInstance, requireLine),
            util.isObjEmpty(methods) || buildMethods(id, subject, methods, requireLine),
          ]},
          // {pre: JSON.stringify(json, null, 2)}
        ],
      }));
    });

    fs.writeFileSync(`${OUT_DIR}/api.html`, `<!DOCTYPE html>\n${index.innerHTML}`);
  };

  function buildConstructor(id, subject, {sig, intro, calls}, requireLine) {
    const {args, argMap} = mapArgs(sig, calls);
    const examples = calls.length && {div: [
      {h6: "Example"},
      requireLine,
      {table: {tbody: calls.map(call => Dom.h({
        class: 'jsdoc-example',
        tr: [{td: `new ${subject.name}(${call[0].map(arg => valueToText(arg)).join(", ")});`}],
      }))}},
    ]};
    return {div: [
      {h5: sig},
      {abstract: jsdocToHtml(intro, argMap, id)},
      buildParams(args, argMap),
      examples,
    ]};
  }

  function buildMethods(id, subject, methods, requireLine) {
    return {div: [
      {h4: "Methods"},
      {div: Object.keys(methods).map(name => {
        const {sig, intro, calls} = methods[name];
        const {args, argMap} = mapArgs(sig, calls);
        const examples = calls.length && {div: [
          {h6: "Example"},
          requireLine,
          {table: {tbody: calls.map(call => Dom.h({
            class: 'jsdoc-example',
            tr: [{td: `${subject.name}.${name}(${call[0].map(arg => valueToText(arg)).join(", ")});`},
                 call[1] === undefined ? '' : {td: ['// returns ', valueToLink(call[1])]}],
          }))}},
        ]};

        return {
          div: [
            {h5: `${subject.name}.${sig}`},
            {abstract: jsdocToHtml(intro, argMap, id)},
            buildParams(args, argMap),
            examples,
          ]
        };
      })},
    ]};
  }

  function mapArgs(sig, calls) {
    sig = /^function\b/.test(sig) ? sig + '{}' : '__'+sig;
    try {
      var ast = parse(sig);
    } catch(ex) {
      const msg = `Error parsing ${sig}`;
      if (ex.name === 'SyntaxError')
        throw new Error(`${msg}:\n${ex}`);
      koru.error(msg);
      throw ex;
    }
    let args;
    const argMap = {};
    traverse(ast, {
      CallExpression (path) {
        path.shouldSkip = true;
        args = path.node.arguments.map((arg, i) => {
          if (arg.type === 'Identifier') {
            argMap[arg.name] = argProfile(calls, i, arg);
            return arg.name;
          }
        });
      }
    });
    return {args, argMap};
  }

  function buildParams(args, argMap) {
    return args && args.length && {class: "jsdoc-args", div: [
      {h6: "Parameters"},
      {table: {tbody: args.map(arg => {
        const am = argMap[arg];
        return {
          class: "jsdoc-arg", tr: [
            {td: arg},
            {td: [{a: am.type, $href: am.href},
                  am.optional ? '(optional) ' : '']
            },
            {td: am.info}
          ]
        };
      })}},
    ]};
  }

  function argProfile(calls, i, arg) {
    let optional = false;
    let types = {};
    calls.forEach(call => {
      const entry = call[0][i];
      if (entry === undefined) {
        optional = true;
      } else {
        if (Array.isArray(entry)) {
          let value;
          switch (entry[0]) {
          case 'O': value = 'object'; break;
          case 'F': value = 'function'; break;
          default: value = entry[entry.length-1];
          }
          types[`${entry[0]}:${entry[entry.length-1]}`] = value;
        } else {
          types[typeof entry] = typeof entry;
        }
      }
    });
    for (let typeId in types) {
      var type = types[typeId];
      break;
    }
    const href = `https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/${util.capitalize(type)}`;
    return {optional, i, types, type, href};
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

  function jsdocToHtml(text, argMap, apiId) {
    const div = document.createElement('div');
    const [info, ...meta] = (text||'').split(/[\n\r]\s*@(?=\w+)/);

    if (meta.length) {
      const params = meta
              .filter(row => /^param\b/.test(row))
              .forEach(row => {
                const m = /^param\s*({[^}]+})?\s*(\[)?(\w+)\]?(?:\s*-)?\s*([\s\S]*)$/.exec(row);
                if (! m)
                  koru.error(`Invalid param for api: ${apiId} line @${row}`);
                const profile = argMap[m[3]] || (argMap[m[3]] = {});
                if (m[4]) profile.info = m[4];
                if (m[2]) profile.optional = true;
                if (m[1]) profile.type = m[1].slice(1,-1);
              });
    }

    info.split(/[\r\n]{2}/).forEach((t,index) => {
      if (index)
        div.appendChild(document.createElement('br'));
      t.split(/(<[^>]*>)/).forEach(part => {
        if (part[0] === '<' && part[part.length-1] === '>')
          div.appendChild(Dom.h({span: part.slice(1,-1), class: 'jsdoc-param'}));
        else
          div.appendChild(document.createTextNode(part));
      });
    });
    return div;
  }

  function idToLink(id) {
    return Dom.h({a: id, class: "jsdoc-idLink", $href: '#'+id});
  }
});
