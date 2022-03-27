define(() => {
  const SVGNS = 'http://www.w3.org/2000/svg';
  const XHTMLNS = 'http://www.w3.org/1999/xhtml';
  const XLINKNS = 'http://www.w3.org/1999/xlink';

  const ATTRS = {id: true, class: true, style: true, xmlns: true};

  const HTML_IGNORE = {id: true, xmlns: true};

  const CANONICAL_TAG_NAMES = {
    div: 'div', DIV: 'div',
    style: 'style', STYLE: 'style',
    script: 'script', SCRIPT: 'script',
    br: 'br', BR: 'br',

    // svg
    svg: 'svg',
    foreignObject: 'foreignObject',
  };

  const canonicalTagName = (elm) => {
    const {tagName} = elm;
    const canon = CANONICAL_TAG_NAMES[tagName];
    if (canon !== undefined) return canon;
    const upperCase = tagName.toUpperCase();
    if (upperCase === tagName) {
      const lowerCase = tagName.toLowerCase();
      CANONICAL_TAG_NAMES[upperCase] = lowerCase;
      CANONICAL_TAG_NAMES[lowerCase] = lowerCase;
      return lowerCase;
    }

    return (CANONICAL_TAG_NAMES[tagName] = tagName);
  };

  const html = (body, xmlns) => {
    let content = null, tagName = '';

    if (typeof body === 'string') {
      if (body.indexOf('\n') !== -1) {
        content = document.createDocumentFragment();
        body.split('\n').forEach((line, index) => {
          index && content.appendChild(document.createElement('br'));
          line && content.appendChild(document.createTextNode(line));
        });
        return content;
      } else {
        return document.createTextNode(body);
      }
    }

    if (body.nodeType) return body;

    if (Array.isArray(body)) {
      const elm = document.createDocumentFragment();
      body.forEach((item) => {
        item != null && elm.appendChild(html(item, xmlns));
      });
      return elm;
    }

    const comment = body.$comment$;
    if (comment !== undefined) return document.createComment(comment);

    const attrs = {};
    let pTag = '', ambig = false;

    if (body.xmlns !== undefined) {
      xmlns = body.xmlns === XHTMLNS ? undefined : body.xmlns;
    }

    for (const key in body) {
      if (HTML_IGNORE[key]) continue;
      const value = body[key];
      if (key[0] === '$') {
        attrs[key.slice(1)] = value;
      } else if (tagName !== '') {
        attrs[key] = value;
      } else if (typeof value !== 'object' && value !== undefined) {
        if (ATTRS[key]) {
          attrs[key] = value;
        } else if (pTag === '') {
          pTag = key; content = value;
        } else {
          ambig = true;
          attrs[key] = value;
        }
      } else {
        if (pTag !== '') {
          attrs[pTag] = content;
          pTag = '';
        }
        tagName = key;
        if (tagName === 'svg') {
          xmlns = SVGNS;
        }
        content = value && html(value, xmlns);
      }
    }

    if (pTag !== '') {
      if (ambig) {
        throw new Error('Ambiguous markup');
      }

      tagName = pTag;
      content = content && (! Array.isArray(content) || content.length != 0)
        ? html(content, xmlns)
        : null;
    }

    const elm = xmlns !== undefined
          ? document.createElementNS(SVGNS, tagName)
          : document.createElement(tagName || 'div');
    canonicalTagName(elm);

    if (body.id !== undefined) elm.id = body.id;
    for (const key in attrs) {
      elm.setAttribute(key, attrs[key]);
    }

    content && elm.appendChild(content);

    return elm;
  };

  const htmlToJson = (node, ns=XHTMLNS) => {
    const {childNodes} = node;
    switch (node.nodeType) {
    case document.TEXT_NODE: return node.textContent;
    case document.ELEMENT_NODE:
      const tagName = canonicalTagName(node);
      const result = {};

      if (ns !== node.namespaceURI) {
        ns = node.namespaceURI;
        if (tagName !== 'svg') {
          result.xmlns = ns;
        }
      }
      let ambig = ATTRS[tagName] !== void 0;
      const {attributes} = node;
      for (let i = 0; i < attributes.length; ++i) {
        const {name, value} = attributes[i];
        if (ATTRS[name] === void 0) ambig = true;
        result[name] = value;
      }
      switch (childNodes.length) {
      case 0:
        if (tagName !== 'div') {
          result[tagName] = ambig ? [] : '';
        }
        break;
      case 1: {
        const v = htmlToJson(node.firstChild, ns);
        result[tagName] = (ambig && typeof v === 'string') || v === '' ? [v] : v;
      } break;
      default:
        const nodes = result[tagName] = [childNodes.length];
        for (let i = 0; i < childNodes.length; ++i)
          nodes[i] = htmlToJson(childNodes[i], ns);
      }
      return result;
    case document.DOCUMENT_FRAGMENT_NODE: {
      const nodes = [childNodes.length];
      for (let i = 0; i < childNodes.length; ++i)
        nodes[i] = htmlToJson(childNodes[i], ns);
      return nodes;
    }
    case document.COMMENT_NODE:
      return {$comment$: node.data};
    }
  };

  const svgUse = (href, attrs) => {
    const useElm = document.createElementNS(SVGNS, 'use');
    useElm.setAttributeNS(XLINKNS, 'href', href);
    for (const name in attrs) useElm.setAttribute(name, attrs[name]);
    return useElm;
  };

  return {
    SVGNS, XHTMLNS, XLINKNS,
    CANONICAL_TAG_NAMES,
    canonicalTagName,

    textToHtml: (body, tagName='div') => {
      const elm = document.createElement(tagName);
      elm.innerHTML = body;
      return elm.firstChild;
    },

    escapeHTML: (text) => {
      const pre = document.createElement('pre');
      pre.appendChild(document.createTextNode(text));
      return pre.innerHTML;
    },

    h: html,
    html,
    htmlToJson,
    svgUse,
  };
});
