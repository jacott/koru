define(()=>{
  return {
    utf8Encode: s =>  Buffer.from(s),

    toBinb: ab => {
      const bin = new Array(ab.length>>5);
      const mask = (1 << 8) - 1;
      const len8 = ab.length * 8;

      for(let i = 0; i < len8; i += 8)
	bin[i>>5] |= (ab[i / 8] & mask) << (24 - i%32);

      return bin;
    },
  };
});
