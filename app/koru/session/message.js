define((require) => {
  'use strict';
  const Uint8ArrayBuilder = require('koru/uint8-array-builder');

  let decodeString, encodeString;
  if (isServer) {
    const {utf8Slice} = Buffer.prototype;

    decodeString = (v, s, e) => utf8Slice.call(v, s, e);
    encodeString = (v) => Buffer.from(v.toString());
  } else {
    const encoder = new globalThis.TextEncoder();
    const decoder = new globalThis.TextDecoder();

    decodeString = (v, s, e) => {
      const u8 = v.subarray(s, e);
      if (u8.length > 2 && u8[0] === 0xef && u8[1] === 0xbb && u8[2] === 0xbf) {
        return '\ufeff' + decoder.decode(u8);
      }
      return decoder.decode(u8);
    };
    encodeString = (v) => encoder.encode(v);
  }

  const utf8to16 = (buffer, i = 0, end) => {
    if (end === undefined) {
      const len = buffer.length;
      for (end = i; end < len && buffer[end] !== 0xff; ++end);
      return [decodeString(buffer, i, end), Math.min(len, end + 1)];
    }
    return [decodeString(buffer, i, end), end];
  };

  const utf16to8 = (out, str) => {
    out.appendUtf8Str(str);
  };

  const tTerm = 0;
  const tUndef = 1;
  const tNull = 2;
  const tTrue = 3;
  const tFalse = 4;
  const tEmptyString = 5;
  const tArray = 6;
  const tObject = 7;
  const tDict = 8;
  const tString = 9;
  const tInt8 = 10;
  const tInt16 = 11;
  const tInt32 = 12;
  const tFloat64 = 13;
  const tDec4 = 14;
  const tDate = 15;
  const tBinary = 16;
  const tDictString = 17;
  const tSparseSmall = 18;
  const tSparseLarge = 19;
  const tEmptyArray = 20;
  const tEmptyObject = 21;
  const tNullObject = 22;
  const tEmptyNullObject = 23;

  const tSmString = 0x80;
  const tSmNumber = 0x40;

  const toStringFunc = Object.prototype.toString;

  const decode = (buffer, index, dict) => {
    const dv = new DataView(buffer.buffer, buffer.byteOffset);
    const byte = buffer[index++];

    switch (byte) {
      case tUndef:
        return [void 0, index];
      case tNull:
        return [null, index];
      case tTrue:
        return [true, index];
      case tFalse:
        return [false, index];
      case tEmptyString:
        return ['', index];
      case tInt8:
        return [dv.getInt8(index), index + 1];
      case tInt16:
        return [dv.getInt16(index), index + 2];
      case tInt32:
        return [dv.getInt32(index), index + 4];
      case tDec4:
        return [dv.getInt32(index) / 10000, index + 4];
      case tFloat64:
        return [dv.getFloat64(index), index + 8];
      case tDate:
        return [new Date(dv.getFloat64(index)), index + 8];
      case tString:
        return utf8to16(buffer, index);
      case tDictString:
        return [getDictItem(dict, (buffer[index] << 8) + buffer[index + 1]), index + 2];
      case tEmptyArray:
        return [[], index];
      case tEmptyObject:
        return [{}, index];
      case tEmptyNullObject:
        return [Object.create(null), index];
      case tArray: {
        const len = buffer.length;
        const out = [];
        let count = 0;
        const sparseResult = [0, 1];
        let result = null;
        for (; index < len && buffer[index] !== tTerm; index = result[1]) {
          switch (buffer[index]) {
            case tSparseSmall:
              result = sparseResult;
              result[1] = index + 2;
              count += buffer[index + 1];
              break;
            case tSparseLarge:
              result = sparseResult;
              result[1] = index + 5;
              count += dv.getUint32(index + 1);
              break;
            default:
              result = decode(buffer, index, dict);
              out[count++] = result[0];
          }
        }
        return [out, ++index];
      }
      case tNullObject:
      case tObject: {
        const len = buffer.length;
        const out = byte === tObject ? {} : Object.create(null);
        let result = null;
        for (; index < len && buffer[index] !== tTerm; index = result[1]) {
          const key = getDictItem(dict, (buffer[index] << 8) + buffer[index + 1]);
          result = decode(buffer, index + 2, dict);
          out[key] = result[0];
        }
        return [out, ++index];
      }
      case tDict:
        return decode(buffer, decodeDict(buffer, index, dict), dict);
      case tBinary: {
        const len = dv.getUint32(index);
        index += 4;
        return [buffer.slice(index, index + len), index + len];
      }
    }

    if (byte & 0x80) {
      return utf8to16(buffer, index, index + (byte - 0x80));
    }

    if (byte & 0x40) {
      return [byte - 0x40, index];
    }

    throw new Error(`Unsupported format: ${byte} at ${index} in:
   ${buffer.subarray(0, index < 21 ? 0 : Math.max(20, index - 20))}${index < 40 ? '' : '...'}${
      buffer.subarray(Math.max(0, index - 20), index + 20)
    }`);
  };

  const encode = (buffer, object, dict) => {
    switch (typeof object) {
      case 'string':
        if (object === '') {
          return buffer.appendByte(tEmptyString);
        }

        if (object.length !== 1) {
          const dkey = dict[1].c2k.length < 0xa000 && object.length < 100 && object[0] !== '{'
            ? addToDict(dict, object)
            : getStringCode(dict, object);
          if (dkey != -1) {
            buffer.appendByte(tDictString).appendByte(dkey >> 8).appendByte(dkey & 0xff);
            return;
          }
        }
        const index = buffer.length;
        buffer.appendByte(tSmString);
        utf16to8(buffer, object);
        const len = buffer.length - index - 1;
        if (len < 128) {
          return buffer.set(index, buffer.get(index) | (buffer.length - index - 1));
        }

        buffer.set(index, tString);
        buffer.appendByte(0xff);
        return;
      case 'number':
        if (object === Math.floor(object) && object >= 0 && object < tSmNumber) {
          return buffer.appendByte(object | tSmNumber);
        }

        if (object == Math.floor(object)) {
          if (object > -129 && object < 128) {
            buffer.appendByte(tInt8).writeInt8(object);
            return;
          }

          if (object > -32769 && object < 32768) {
            buffer.appendByte(tInt16).writeInt16BE(object);
            return;
          }

          if (object > -2147483649 && object < 2147483648) {
            buffer.appendByte(tInt32).writeInt32BE(object);
            return;
          }
        }

        // // up to 4 decimals
        const dec4 = object * 10000;
        if (dec4 === Math.floor(dec4) && dec4 > -2147483649 && dec4 < 2147483648) {
          buffer.appendByte(tDec4).writeInt32BE(dec4);
          return;
        }

        buffer.appendByte(tFloat64).writeDoubleBE(object);
        return;
      case 'boolean':
        return buffer.appendByte(object === true ? tTrue : tFalse);
      case 'undefined':
        return buffer.appendByte(tUndef);
      case 'function':
        throw new Error('serializing functions not supportd');
    }

    if (object === null) return buffer.appendByte(tNull);

    const constructor = object.constructor;

    if (constructor === Object || constructor === void 0) {
      buffer.appendByte(constructor === void 0 ? tNullObject : tObject);
      let len = buffer.length;
      for (let key in object) {
        const value = object[key];
        if (typeof value === 'symbol') continue;
        const dkey = addToDict(dict, key);
        if (dkey == -1) throw new Error('Dictionary overflow');
        buffer.appendByte(dkey >> 8).appendByte(dkey & 0xff);
        encode(buffer, value, dict);
      }
      if (len === buffer.length) {
        buffer.set(len - 1, constructor === void 0 ? tEmptyNullObject : tEmptyObject);
      } else {
        buffer.appendByte(tTerm);
      }
    } else if (constructor === Array) {
      if (object.length == 0) {
        buffer.appendByte(tEmptyArray);
      } else {
        buffer.appendByte(tArray);
        let last = -1;
        object.forEach((o, index) => {
          const diff = index - last - 1;
          if (diff !== 0) {
            if (diff < 256) {
              buffer.appendByte(tSparseSmall).appendByte(diff);
            } else {
              if (diff > 4294967294) throw new Error('sparse array too sparse');
              buffer.appendByte(tSparseLarge).writeUInt32BE(diff);
            }
          }
          last = index;
          encode(buffer, o, dict);
        });
        buffer.appendByte(tTerm);
      }
    } else if (constructor === Date) {
      buffer.appendByte(tDate).writeDoubleBE(object.getTime());
    } else if (object instanceof Uint8Array) {
      buffer.appendByte(tBinary).writeUInt32BE(object.byteLength);
      buffer.append(object);
    } else {
      throw new Error('type is unserializable: ' + constructor);
    }
  };

  const newLocalDict = (initialCapacity = 1024) => ({
    index: 0,
    k2c: Object.create(null),
    c2k: [],
    buffer: initialCapacity == -1 ? void 0 : new Uint8ArrayBuilder(initialCapacity),
  });

  const getStringCode = (dict, word) => {
    if (dict.constructor === Array) {
      const code = dict[0].k2c[word];
      if (code) return code;
      dict = dict[1];
    }
    const code = dict.k2c[word];
    return code === void 0 ? -1 : code;
  };

  const addToDict = (dict, name) => {
    let limit = 0xfff0;
    if (dict.constructor === Array) {
      limit = dict[0].limit;
      const code = dict[0].k2c[name];
      if (code !== void 0) return code;
      dict = dict[1];
    }
    const k2c = dict.k2c;
    const code = k2c[name];
    if (code !== void 0) return code;

    const index = dict.index == 0 ? 0x100 : dict.index;

    if (index >= limit) return -1;
    dict.index = index + 1;

    k2c[name] = index;

    dict.c2k.push(name);
    if (dict.buffer !== void 0) {
      utf16to8(dict.buffer, name);
      dict.buffer.appendByte(0xff);
    }
    return index;
  };

  const decodeDict = (buffer, index, dict) => {
    while (index < buffer.length && buffer[index] !== tTerm) {
      const pair = utf8to16(buffer, index);
      addToDict(dict, pair[0]);
      index = pair[1];
    }
    return index + 1;
  };

  const getDictItem = (dict, code) => {
    const d = dict[0];
    if (code >= d.limit) {
      return d.c2k[code - d.limit];
    }
    return dict[1].c2k[code - 0x100];
  };

  const newGlobalDict = () => {
    const dict = newLocalDict(4096);
    dict.limit = 0xfff0;
    return dict;
  };

  const finalizeGlobalDict = (dict) => {
    if (dict.index == -1) return;
    const {c2k, k2c} = dict;
    const delta = dict.limit = 0xffff - c2k.length;

    for (let i = 0; i < c2k.length; ++i) {
      k2c[c2k[i]] = i + delta;
    }
    dict.index = -1;
    return dict;
  };

  const emptyDict = newGlobalDict();
  finalizeGlobalDict(emptyDict);

  return {
    openEncoder: (type, globalDict) => {
      const buffer = new Uint8ArrayBuilder(1024);
      let dict = newLocalDict();
      dict.buffer.appendByte(type.charCodeAt(0));

      const dicts = [globalDict, dict];

      let length = 0;

      return {
        push: (arg) => {
          if (length != 0) {
            dict.buffer.length = length;
            length = 0;
          }
          encode(buffer, arg, dicts);
        },
        encode() {
          const b = dict.buffer;
          length = b.length;
          b.appendByte(tTerm);
          b.append(buffer.subarray());

          return b.subarray();
        },
      };
    },
    encodeMessage: (type, args, globalDict = emptyDict) => {
      const buffer = new Uint8ArrayBuilder(1024);

      const dicts = [globalDict, newLocalDict()];
      const dictBuilder = dicts[1].buffer;
      dictBuilder.appendByte(type.charCodeAt(0));

      const len = args.length;
      for (let i = 0; i < len; ++i) {
        encode(buffer, args[i], dicts);
      }

      dictBuilder.appendByte(tTerm);

      dictBuilder.append(buffer.subarray());
      return dictBuilder.subarray();
    },

    decodeMessage: (u8, globalDict = emptyDict) => {
      const dict = newLocalDict(-1);
      let index = decodeDict(u8, 0, dict);

      const len = u8.length;
      const out = [];
      let result = null;
      for (; index < len; index = result[1]) {
        result = decode(u8, index, [globalDict, dict]);
        out.push(result[0]);
      }

      return out;
    },

    _encode: encode,
    _decode: decode,
    _newLocalDict: newLocalDict,

    newGlobalDict,
    finalizeGlobalDict,

    toHex: (data) => {
      const result = [];
      for (let i = 0; i < data.length; ++i) {
        let ltr = data[i].toString(16);
        if (ltr.length === 1) ltr = '0' + ltr;
        result.push(ltr);
      }
      return result;
    },

    addToDict,
    encodeDict: ({buffer}) => {
      buffer.appendByte(tTerm);
      return buffer.subarray();
    },
    decodeDict,
    getDictItem,
    getStringCode,
  };
});
