define({
  getMentionIds: function (md) {
    var hyperlinks = this.findHyperLinks(md, '@');

    for(var i = 0; i < hyperlinks.length; ++i) {
      hyperlinks[i] = hyperlinks[i][2];
    }

    return hyperlinks;
  },

  findHyperLinks: function(md, prefix) {
    var m, re = /\[([\s\S]*?)\]\(([^)]*)\)/g;
    var m2, re2 = /[\[\]]/g;
    var result = [];
    var pLen = prefix && prefix.length;
    while ((m = re.exec(md)) !== null) {
      if (m.index > 0 && md[m.index - 1] === '\\') {
        re.lastIndex = m.index + m[0].indexOf(']');
        if (re.lastIndex <= m.index)
          break;

        continue;
      }
      re2.lastIndex = 0;

      if (pLen && md.slice(m.index - pLen, m.index) !== prefix) continue;

      var nest = 1;
      var lstart = m.index;
      var mi = 0;
      while ((m2 = re2.exec(m[1])) !== null) {
        if (m2[0] === ']') nest > 0 && --nest;
        else if (++nest === 1) {
          mi = re2.lastIndex;
          lstart += mi;
        }
      }
      result.push([lstart, mi ? m[1].slice(mi) : m[1], m[2]]);
    }
    return result;
  },
});
