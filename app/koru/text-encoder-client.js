define(()=>{
  if (window.TextDecoder !== undefined) {
    const encoder = new window.TextEncoder();
    const decoder = new window.TextDecoder();
    return {
      utf8to16(buffer, i=0, end) {
        if (end === undefined) {
          const len = buffer.length;
          for(end = i; end < len && buffer[end] !== 0xff; ++end)
            ;
          return [decoder.decode(buffer.subarray(i, end)), Math.min(len, end+1)];
        }
        return [decoder.decode(buffer.subarray(i, end)), end];
      },

      utf16to8(out, str) {
        const start = out.length;
        const ab = encoder.encode(str);
        const len = ab.length;
        out.length += len;
        for(let i = 0; i < len; ++i) out[i+start] = ab[i];
      }
    };
  } else return {
    utf8to16(buffer, i=0, end=buffer.length) {
      let out = "";
      --i;
      while(++i < end) {
        const c = buffer[i];
        switch(c >> 4) {
        case 0: case 1: case 2: case 3: case 4: case 5: case 6: case 7:
	  // 0xxxxxxx
	  out += String.fromCharCode(c);
	  break;
        case 12: case 13:
	  // 110x xxxx   10xx xxxx
	  out += String.fromCharCode(((c & 0x1F) << 6) | (buffer[++i] & 0x3F));
	  break;
        case 14:
	  // 1110 xxxx  10xx xxxx  10xx xxxx
	  const char2 = buffer[++i];
	  const char3 = buffer[++i];
	  out += String.fromCharCode(((c & 0x0F) << 12) |
				     ((char2 & 0x3F) << 6) |
				     ((char3 & 0x3F) << 0));
	  break;
        case 15:
          return [out, i + 1];
        }
      }

      return [out, i];
    },

    utf16to8(out, str) {
      const len = str.length;
      for(let i = 0; i < len; ++i) {
        const c = str.charCodeAt(i);
        if ((c >= 0x0000) && (c <= 0x007F))
	  out.push(str.charCodeAt(i));
        else if (c > 0x07FF)
	  out.push(0xE0 | ((c >> 12) & 0x0F), 0x80 |
                   ((c >>  6) & 0x3F), 0x80 | ((c >>  0) & 0x3F));
        else
	  out.push(0xC0 | ((c >>  6) & 0x1F), 0x80 | ((c >>  0) & 0x3F));
      }
    },
  };
});
