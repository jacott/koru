var output, needspace;

App.extend(App.Markdown, {
  fromHtml: function (html) {
    output = []; needspace = false;
    html && outputChildNodes(html, '*');
    var result = output.join('');
    output = null;
    return result;
  },

  toHtml: function (md, wrapper) {
    md = md || '';
    var hypherlinks = App.Markdown.findHyperLinks(md);
    var mdlen = md.length;
    var index = 0;
    var lookfor = [];
    var frag = wrapper ? document.createElement(wrapper) : document.createDocumentFragment();
    var elm = frag;
    var token, mention;
    var hlidx =  0;
    var hlStart = hypherlinks.length ? hypherlinks[0][0] : mdlen;
    var hlEnd = null;
    while (index < mdlen) {

      // End of <a> textContent
      if (hlEnd === index) {
        var href = hypherlinks[hlidx][2];
        if (mention) {
          elm.setAttribute('data-'+ (mention === '@' ? 'a' : 'h'), href);
          elm.setAttribute('contenteditable', 'false');
        } else {
          elm.setAttribute('href', href);
        }
        index += href.length + 3;
        if (index === mdlen) break;
        elm = elm.parentNode;
        hlEnd = null;
        mention = null;
        hlStart = ++hlidx < hypherlinks.length ? hypherlinks[hlidx][0] : mdlen;
      }

      // Start of <a> textContent
      if (hlStart === index) {
        var link = document.createElement(mention ? 'span' : 'a');
        ++index;
        hlEnd = hlStart + hypherlinks[hlidx][1].length + 1;
        elm.appendChild(link);
        elm = link;
      }


      switch(md[index]) {
        // <b> and <i>
      case '*': case '_':
        token = md[index];
        if (md[++index] === token) {
          ++index;
          token = token+token;
        }

        if (lookfor.length && lookfor[lookfor.length - 1] == token) {
          --lookfor.length;
          elm = elm.parentNode;
        } else {
          var i = document.createElement(token.length === 1 ? 'i' : 'b');
          elm.appendChild(i);
          elm = i;
          lookfor.push(token);
        }
        break;

        // <br> and <p>
      case '\n':
        if (md[++index] === "\n") {
          ++index;
          var p = document.createElement('p');
          (elm.parentNode || elm).appendChild(p);
          elm = p;
        } else {
          var br =  document.createElement('br');
          elm.appendChild(br);
        }
        break;

        // textContent
      default:
        var len = (hlEnd || hlStart);
        for(var i = index; i < len && ! md[i].match(/[*_\n]/); ++i) {}

        var atHash = false;

        if (i > 0 && i === hlStart && md[i-1].match(/[@#]/)) {
          atHash = true;
          mention = md[i-1];
        }

        if (i > index) {
          var tn = document.createTextNode(md.slice(index, atHash ? i-1 : i));
          index = i;
          elm.appendChild(tn);
        }
      }
    }
    return frag;
  },
});

function fromHtml(html, flag) {
  switch(html.nodeType) {
  case document.TEXT_NODE:
    spaceIfNeeded(html.textContent);
    output.push(html.textContent.replace(/ /g, ' '));
    break;
  case document.ELEMENT_NODE:
    switch(html.tagName) {

    case 'B': case 'STRONG':
      stressText(html, flag + flag);
      break;

    case 'I': case 'EM':
      stressText(html, flag);
      break;

    case 'SPAN':
      var id = html.getAttribute('data-a');
      if (id) {
        output.push('@[');
      } else {
        id = html.getAttribute('data-h');
        id &&  output.push('#[');
      }
      if (id) {
        outputChildNodes(html, flag);
        output.push('](' + id + ')');
        break;
      }
      outputChildNodes(html, flag);
      break;

    case 'BR':
      output.push('\n');
      break;

    case 'A':
      output.push('[');
      outputChildNodes(html, flag);
      output.push('](' + html.getAttribute('href') + ')');
      break;

    case 'DIV':
      output.push('\n');
      outputChildNodes(html, flag);
      break;
    case 'P':
      output.push('\n\n');
      outputChildNodes(html, flag);
      break;
    default:
      outputChildNodes(html, flag);
      break;
    }
  }
}

function spaceIfNeeded(text) {
  needspace && text.match(/^\S/) && output.push(' ');
  needspace = false;
}

function stressText(html, flags) {
  if (output.length && output[output.length -1].match(/\S$/))
    output.push(' ');

  needspace = false;
  var flag = flags[0];
  output.push(flags);
  outputChildNodes(html, flipFlag(flag));
  output.push(flags);
  needspace = true;
}

function outputChildNodes(html, flag) {
  var children = html.childNodes;

  for(var i = 0; i < children.length; ++i) {
    var row = children[i];
    fromHtml(row, flag);
  }
}

function flipFlag(flag) {
  return flag === '*' ? '_' : '*';
}
