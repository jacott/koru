define(function(require, exports, module) {
  return {
    utf8to16(buffer, i=0, end) {
      if (end === undefined) {
        const len = buffer.length;
        for(end = i; end < len && buffer[end] !== 0xff; ++end)
          ;
        return [Buffer.from(buffer).toString('utf8', i, end), Math.min(len, end+1)];
      }
      return [Buffer.from(buffer).toString('utf8', i, end), end];
    },

    utf16to8(out, str) {
      const start = out.length;
      const ab = Buffer.from(str);
      const len = ab.length;
      out.length += len;
      for(let i = 0; i < len; ++i) out[i+start] = ab[i];
    }
  };
});
