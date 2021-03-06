define((require)=>{
  'use strict';
  const {utf8to16, utf16to8} = require('koru/text-encoder');

  const pushEach = (buffer, args) => {
    const start = buffer.length;
    const len = args.length;
    buffer.length = start + len;
    for(let i = 0; i < len; ++i) buffer[i+start] = args[i];
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

  const tSmString = 0x80;
  const tSmNumber = 0x40;

  const toStringFunc = Object.prototype.toString;

  const tmpAb = new ArrayBuffer(8);
  const tmpDv = new DataView(tmpAb);
  const tmpU8 = new Uint8Array(tmpAb);

  const decode = (buffer, index, dict) => {
    const byte = buffer[index++];

    switch(byte) {
    case tUndef: return [void 0, index];
    case tNull: return [null, index];
    case tTrue: return [true, index];
    case tFalse: return [false, index];
    case tEmptyString: return ['', index];

    case tInt8:
      tmpU8[0] = buffer[index];
      return [tmpDv.getInt8(0), index + 1];

    case tInt16:
      tmpU8.set(buffer.subarray(index, index + 2), 0);
      return [tmpDv.getInt16(0), index + 2];

    case tInt32:
      tmpU8.set(buffer.subarray(index, index + 4), 0);
      return [tmpDv.getInt32(0), index + 4];

    case tDec4:
      tmpU8.set(buffer.subarray(index, index + 4), 0);
      return [tmpDv.getInt32(0)/10000, index + 4];

    case tFloat64:
      tmpU8.set(buffer.subarray(index, index + 8), 0);
      return [tmpDv.getFloat64(0), index + 8];

    case tDate:
      tmpU8.set(buffer.subarray(index, index + 8), 0);
      return [new Date(tmpDv.getFloat64(0)), index + 8];

    case tString:
      return utf8to16(buffer, index);

    case tDictString:
      return [getDictItem(dict, (buffer[index] << 8) + buffer[index+1]), index + 2];

    case tArray: {
      const len = buffer.length;
      const out = [];
      let count = 0;
      const sparseResult = [0,1];
      let result = null;
      for(;index < len && buffer[index] !== tTerm; index = result[1]) {
        switch(buffer[index]) {
        case tSparseSmall:
          result = sparseResult;
          result[1] = index+2;
          count += buffer[index+1];
          break;
        case tSparseLarge:
          result = sparseResult;
          tmpU8.set(buffer.subarray(index + 1, result[1] = index + 5), 0);
          count += tmpDv.getUint32(0);
          break;
        default:
          result = decode(buffer, index, dict);
          out[count++] = result[0];
        }
      }
      return [out, ++index];

    } case tObject: {
      const len = buffer.length;
      const out = {};
      let result = null;
      for(;index < len && buffer[index] !== tTerm; index = result[1]) {
        const key = getDictItem(dict, (buffer[index] << 8) + buffer[index+1]);
        result = decode(buffer, index + 2, dict);
        out[key] = result[0];
      }
      return [out, ++index];

    } case tDict:
      return decode(buffer, decodeDict(buffer, index, dict), dict);

    case tBinary: {
      tmpU8.set(buffer.subarray(index, index + 4), 0);
      const len = tmpDv.getUint32(0);
      index += 4;
      return [buffer.slice(index, index + len), index + len];
    }}

    if (byte & 0x80)
      return utf8to16(buffer, index, index + (byte - 0x80));

    if (byte & 0x40)
      return [byte - 0x40, index];

    throw new Error(`Unsupported format: ${byte} at ${index}`);
  };

  const encode = (buffer, object, dict) => {
    switch(typeof object) {
    case 'string':
      if (object === '')
        return buffer.push(tEmptyString);


      if (object.length !== 1) {
        const dkey = dict[1].c2k.length < 0xa000 && object.length < 100 && object[0] !== '{' ?
                addToDict(dict, object) : getStringCode(dict, object);
        if (dkey != -1) {
          buffer.push(tDictString, dkey >> 8, dkey & 0xff);
          return;
        }
      }
      const index = buffer.length;
      buffer.push(tSmString);
      utf16to8(buffer, object);
      const len = buffer.length - index - 1;
      if (len < 128)
        return buffer[index] = buffer[index] | (buffer.length - index - 1);

      buffer[index] = tString;
      buffer.push(0xff);
      return;

    case 'number':
      if (object === Math.floor(object) && object >= 0 && object < tSmNumber)
        return buffer.push(object | tSmNumber);

      tmpDv.setInt8(0, object);
      if (tmpDv.getInt8(0) === object)
        return buffer.push(tInt8, tmpU8[0]);

      tmpDv.setInt16(0, object);
      if (tmpDv.getInt16(0) === object)
        return buffer.push(tInt16, tmpU8[0], tmpU8[1]);


      tmpDv.setInt32(0, object);
      if (tmpDv.getInt32(0) === object) {
        buffer.push(tInt32);
        pushEach(buffer, tmpU8.subarray(0, 4));
        return;
      }

      // up to 4 decimals
      tmpDv.setInt32(0, object*10000);
      if (tmpDv.getInt32(0) === object*10000) {
        buffer.push(tDec4);
        pushEach(buffer, tmpU8.subarray(0, 4));
        return;
      }

      tmpDv.setFloat64(0, object);

      buffer.push(tFloat64);
      pushEach(buffer, tmpU8);
      return;

    case 'boolean':
      return buffer.push(object === true ? tTrue : tFalse);
    case 'undefined':
      return buffer.push(tUndef);
    case 'function':
      throw new Error('serializing functions not supportd');
    }

    if (object === null) return buffer.push(tNull);

    const constructor = object.constructor;

    if(constructor === Object || constructor === void 0) {
      buffer.push(tObject);
      for (let key in object) {
        const value = object[key];
        if (typeof value === 'symbol') continue;
        const dkey = addToDict(dict, key);
        if (dkey == -1) throw new Error("Dictionary overflow");
        buffer.push(dkey >> 8, dkey & 0xff);
        encode(buffer, value, dict);
      }
      buffer.push(tTerm);

    } else if (constructor === Array) {
      buffer.push(tArray);
      let last = -1;
      object.forEach((o, index) => {
        const diff = index - last - 1;
        if (diff !== 0) {
          if (diff < 256) {
            buffer.push(tSparseSmall);
            tmpDv.setInt8(0, diff);
            buffer.push(tmpU8[0]);
          } else {
            if (diff > 4294967294) throw new Error("sparse array too sparse");
            buffer.push(tSparseLarge);
            tmpDv.setUint32(0, diff);
            pushEach(buffer, tmpU8.subarray(0, 4));
          }
        }
        last = index;
        encode(buffer, o, dict);
      });
      buffer.push(tTerm);

    } else if (constructor === Date) {
      buffer.push(tDate);
      tmpDv.setFloat64(0, object.getTime());
      pushEach(buffer, tmpU8);

    } else if (constructor === Uint8Array) {
      // TODO rather than copy the data into tmp buffer place a marker
      // in buffer and store ref to object to later fast copy to
      // result ArrayBuffer.

      buffer.push(tBinary);
      tmpDv.setUint32(0, object.byteLength);
      pushEach(buffer, tmpU8.subarray(0, 4));
      pushEach(buffer, object);
    } else
      throw new Error('type is unserializable: '+constructor);
  };

  const newLocalDict = () => ({index: 0, k2c: Object.create(null), c2k: []});

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

    dict.c2k[index - 0x100] = name;
    return index;
  };

  const encodeDict = (dict, buffer) => {
    const c2k = dict.c2k;
    const len = c2k.length;
    for(let i = 0; i < len; ++i) {
      utf16to8(buffer, c2k[i]);
      buffer.push(0xff);
    }
    buffer.push(tTerm);
    return buffer;
  };

  const decodeDict = (buffer, index, dict) => {
    while(index < buffer.length && buffer[index] !== tTerm) {
      const pair = utf8to16(buffer, index);
      addToDict(dict, pair[0]);
      index = pair[1];
    }
    return index + 1;
  };

  const getDictItem = (dict, code) => {
    const d = dict[0];
    if (code >= d.limit)
      return d.c2k[code - d.limit];
    return dict[1].c2k[code - 0x100];
  };

  return {
    openEncoder: (type, globalDict)=>{
      const buffer = [];
      let dict = newLocalDict();

      const dicts = [globalDict, dict];

      return {
        push: arg =>{encode(buffer, arg, dicts)},
        encode() {
          const ed = encodeDict(dict, [type.charCodeAt(0)]);

          const result = new Uint8Array(ed.length + buffer.length);
          result.set(ed, 0);
          result.set(buffer, ed.length);

          return result;
        }
      };
    },
    encodeMessage: (type, args, globalDict)=>{
      const buffer = [];
      let dict = newLocalDict();

      const dicts = [globalDict, dict];

      const len = args.length;
      for(let i = 0; i < len; ++i)
        encode(buffer, args[i], dicts);

      dict = encodeDict(dict, [type.charCodeAt(0)]);

      const result = new Uint8Array(dict.length + buffer.length);
      result.set(dict, 0);
      result.set(buffer, dict.length);

      return result;
    },

    decodeMessage: (u8, globalDict)=>{
      const dict = newLocalDict();
      let index = decodeDict(u8, 0, dict);

      const len = u8.length;
      const out = [];
      let result = null;
      for(;index < len; index = result[1]) {
        result = decode(u8, index, [globalDict, dict]);
        out.push(result[0]);
      }

      return out;
    },

    _encode:  encode,
    _decode: decode,
    _newLocalDict: newLocalDict,

    _utf8to16: utf8to16,
    _utf16to8: utf16to8,

    newGlobalDict: ()=>{
      const dict = newLocalDict();
      dict.limit = 0xfff0;
      return dict;
    },

    finalizeGlobalDict: (dict)=>{
      if (dict.index == -1) return;
      const {c2k, k2c} = dict;
      const delta = dict.limit = 0xffff - c2k.length;

      for (let i = 0; i < c2k.length; ++i) {
        k2c[c2k[i]] = i + delta;
      }
      dict.index = -1;
      return dict;
    },

    toHex: (data)=>{
      const result = [];
      for(let i = 0; i < data.length; ++i) {
        let ltr = data[i].toString(16);
        if (ltr.length === 1) ltr = '0'+ltr;
        result.push(ltr);
      }
      return result;
    },

    addToDict,
    encodeDict,
    decodeDict,
    getDictItem,
    getStringCode,
  };
});
