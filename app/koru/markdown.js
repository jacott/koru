define({
  getMentionIds: function (md) {
    var hypherlinks = this.findHyperLinks(md, '@');

    for(var i = 0; i < hypherlinks.length; ++i) {
      hypherlinks[i] = hypherlinks[i][2];
    }

    return hypherlinks;
  },

  findHyperLinks: function(md, prefix) {
    var m, re = /\[([\s\S]*?)\]\(([^)]*)\)/g;
    var m2, re2 = /[\[\]]/g;
    var result = [];
    var pLen = prefix && prefix.length;
    while ((m = re.exec(md)) !== null) {
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
