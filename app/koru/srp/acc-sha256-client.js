define(()=>{
  if (window.TextDecoder !== undefined) {
    const encoder = new window.TextEncoder();
    return {
      utf8Encode: s =>  encoder.encode(s),

      toBinb: ab => {
        const bin = new Array(ab.length>>5);
        const mask = (1 << 8) - 1;
        const len8 = ab.length * 8;

        for(var i = 0; i < len8; i += 8)
	  bin[i>>5] |= (ab[i / 8] & mask) << (24 - i%32);

        return bin;
      },
    };
  } else return {
    utf8Encode: s => unescape(encodeURIComponent(s)),
    toBinb: str => {
      const bin = new Array(str.length>>5);
      const mask = (1 << 8) - 1;
      const len8 = str.length * 8;
      for(var i = 0; i < len8; i += 8) {
	bin[i>>5] |= (str.charCodeAt(i / 8) & mask) << (24 - i%32);
      }
      return bin;
    },
  };
});
