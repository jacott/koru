if (! Uint8Array.prototype.hasOwnProperty('slice')) Uint8Array.prototype.slice = Uint8Array.prototype.subarray;

define(function(require, exports, module) {
  var util = require('../util');

  var tTerm = 0;
  var tUndef = 1;
  var tNull = 2;
  var tTrue = 3;
  var tFalse = 4;
  var tEmptyString = 5;
  var tArray = 6;
  var tObject = 7;
  var tDict = 8;
  var tString = 9;
  var tInt8 = 10;
  var tInt16 = 11;
  var tInt32 = 12;
  var tFloat64 = 13;
  var tDec4 = 14;
  var tDate = 15;
  var tBinary = 16;
  var tDictString = 17;

  var tSmString = 0x80;
  var tSmNumber = 0x40;

  var toStringFunc = Object.prototype.toString;

  exports.encodeMessage = function (type, args, globalDict) {
    var buffer = [];
    var dict = newLocalDict();

    util.forEach(args, function (o) {
      encode(buffer, o, [globalDict, dict]);
    });

    dict = encodeDict(dict, [type.charCodeAt(0)]);

    var result = new Uint8Array(dict.length + buffer.length);
    result.set(dict, 0);
    result.set(buffer, dict.length);

    return result;
  },

  exports.decodeMessage = function (u8, globalDict) {
    var dict = newLocalDict();
    var index = decodeDict(u8, 0, dict);

    var len = u8.length;
    var out = [];
    for(;index < len; index = result[1]) {
      var result = decode(u8, index, [globalDict, dict]);
      out.push(result[0]);
    }

    return out;
  },

  exports._encode =  encode;
  function encode(buffer, object, dict) {
    var tmpAb = new ArrayBuffer(8);
    var tmpDv = new DataView(tmpAb);
    var tmpU8 = new Uint8Array(tmpAb);

    switch(typeof object) {

    case 'string':
      if (object === '')
        return buffer.push(tEmptyString);


      if (object.length !== 1) {
        var dkey = dict[1].c2k.length < 0xa000 && object.length < 100 && object[0] !== '{' ? addToDict(dict, object) : getString(dict, object);
        if (dkey !== null) {
          buffer.push(tDictString, dkey >> 8, dkey & 0xff);
          return;
        }
      }
      var index = buffer.length;
      buffer.push(tSmString);
      utf16to8(buffer, object);
      var len = buffer.length - index - 1;
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
        return util.forEach(tmpU8.subarray(0, 4), function (v) {
          buffer.push(v);
        });
      }

      // up to 4 decimals
      tmpDv.setInt32(0, object*10000);
      if (tmpDv.getInt32(0) === object*10000) {
        buffer.push(tDec4);
        return util.forEach(tmpU8.subarray(0, 4), function (v) {
          buffer.push(v);
        });
      }

      tmpDv.setFloat64(0, object);

      buffer.push(tFloat64);
      return util.forEach(tmpU8, function (v) {
        buffer.push(v);
      });

    case 'boolean':
      return buffer.push(object === true ? tTrue : tFalse);
    case 'undefined':
      return buffer.push(tUndef);
    case 'function':
      throw new Error('serializing functions not supportd');
    }

    if (object === null) return buffer.push(tNull);

    switch(toStringFunc.call(object)) {
    case "[object Date]":
      buffer.push(tDate);
      tmpDv.setFloat64(0, object.getTime());
      return util.forEach(tmpU8, function (v) {
        buffer.push(v);
      });
    case "[object Array]":
      buffer.push(tArray);
      util.forEach(object, function (o) {
        encode(buffer, o, dict);
      });
      return buffer.push(tTerm);
    case "[object Uint8Array]":
      // TODO rather than copy the data into tmp buffer place a marker
      // in buffer and store ref to object to later fast copy to
      // result ArrayBuffer.

      buffer.push(tBinary);
      tmpDv.setUint32(0, object.byteLength);
      util.forEach(tmpU8.subarray(0, 4), function (v) {
        buffer.push(v);
      });
      return util.forEach(object, function (v) {
        buffer.push(v);
      });
    }

    buffer.push(tObject);
    for(var key in object) {
      var dkey = addToDict(dict, key);
      if (dkey === null) throw new Error("Dictionary overflow");
      buffer.push(dkey >> 8, dkey & 0xff);
      encode(buffer, object[key], dict);
    }
    buffer.push(tTerm);
  }

  exports.newGlobalDict = function () {
    var dict = newLocalDict();
    dict.limit = 0xfff0;
    return dict;
  };

  exports._newLocalDict = newLocalDict;
  function newLocalDict() {return {index: 0, k2c: {}, c2k: []}}

  exports.finializeGlobalDict = function (dict) {
    if (dict.index === null) return;
    var c2k = dict.c2k;
    var k2c = dict.k2c;
    var delta = dict.limit = 0xffff - c2k.length;

    for(var i = 0; i < c2k.length; ++i) {
      k2c[c2k[i]] = i + delta;
    }
    dict.index = null;
  };

  function getString(dict, word) {
    if (Array.isArray(dict)) {
      var code = dict[0].k2c[word];
      if (code) return code;
      dict = dict[1];
    }
    var code = dict.k2c[word];
    if (code) return code;
    return null;
  }

  exports.addToDict = addToDict;
  function addToDict(dict, name) {
    if (Array.isArray(dict)) {
      var limit = dict[0].limit;
      var code = dict[0].k2c[name];
      if (code) return code;
      dict = dict[1];
    } else {
      var limit = 0xfff0;
    }
    var k2c = dict.k2c;
    var code = k2c[name];
    if (code) return code;

    var index = dict.index || 0x100;

    if (index >= limit) return null;
    dict.index = index + 1;

    k2c[name] = index;

    var c2k = dict.c2k || (dict.c2k = []);
    c2k[index - 0x100] = name;
    return index;
  }

  exports.encodeDict = encodeDict;
  function encodeDict(dict, buffer) {
    var c2k = dict.c2k;
    var len = c2k.length;
    for(var i = 0; i < len; ++i) {
      utf16to8(buffer, c2k[i]);
      buffer.push(0xff);
    }
    buffer.push(tTerm);
    return buffer;
  }

  exports.decodeDict = decodeDict;
  function decodeDict(buffer, index, dict) {
    while(index < buffer.length && buffer[index] !== tTerm) {
      var pair = utf8to16(buffer, index);
      addToDict(dict, pair[0]);
      index = pair[1];
    }
    return index + 1;
  }

  exports.toHex = function (data) {
    var result = [];
    for(var i = 0; i < data.length; ++i) {
      var ltr = data[i].toString(16);
      if (ltr.length === 1) ltr = '0'+ltr;
      result.push(ltr);
    }
    return result;
  };

  exports.getDictItem = getDictItem;
  function getDictItem(dict, code) {
    var d = dict[0];
    if (code >= d.limit)
      return d.c2k[code - d.limit];
    return dict[1].c2k[code - 0x100];
  }

  exports._decode = decode;
  function decode(buffer, index, dict) {
    var tmpAb = new ArrayBuffer(8);
    var tmpDv = new DataView(tmpAb);
    var tmpU8 = new Uint8Array(tmpAb);

    var byte = buffer[index++];

    switch(byte) {
    case tUndef: return [undefined, index];
    case tNull: return [null, index];
    case tTrue: return [true, index];
    case tFalse: return [false, index];
    case tEmptyString: return ['', index];

    case tInt8:
      tmpU8[0] = buffer[index];
      return [tmpDv.getInt8(0), index + 1];

    case tInt16:
      tmpU8.set(buffer.slice(index, index + 2), 0);
      return [tmpDv.getInt16(0), index + 2];

    case tInt32:
      tmpU8.set(buffer.slice(index, index + 4), 0);
      return [tmpDv.getInt32(0), index + 4];

    case tDec4:
      tmpU8.set(buffer.slice(index, index + 4), 0);
      return [tmpDv.getInt32(0)/10000, index + 4];

    case tFloat64:
      tmpU8.set(buffer.slice(index, index + 8), 0);
      return [tmpDv.getFloat64(0), index + 8];

    case tDate:
      tmpU8.set(buffer.slice(index, index + 8), 0);
      return [new Date(tmpDv.getFloat64(0)), index + 8];

    case tString:
      return utf8to16(buffer, index);

    case tDictString:
      return [getDictItem(dict, (buffer[index] << 8) + buffer[index+1]), index + 2];

    case tArray:
      var len = buffer.length;
      var out = [];
      for(;index < len && buffer[index] !== tTerm; index = result[1]) {
        var result = decode(buffer, index, dict);
        out.push(result[0]);
      }
      return [out, ++index];

    case tObject:
      var len = buffer.length;
      var out = {};
      for(;index < len && buffer[index] !== tTerm; index = result[1]) {
        var key = getDictItem(dict, (buffer[index] << 8) + buffer[index+1]);
        var result = decode(buffer, index + 2, dict);
        out[key] = result[0];
      }
      return [out, ++index];

    case tDict:
      return decode(buffer, decodeDict(buffer, index, dict), dict);

    case tBinary:
      tmpU8.set(buffer.slice(index, index + 4), 0);
      var len = tmpDv.getUint32(0);
      index += 4;
      return [new Uint8Array(buffer.slice(index, index + len)), index + len];
    }

    if (byte & 0x80)
      return utf8to16(buffer, index, index + (byte - 0x80));

    if (byte & 0x40)
      return [byte - 0x40, index];

    throw new Error('Unsupported format: ' + byte);
  }

  exports.utf16to8 = utf16to8;
  function utf16to8(out, str) {
    var len = str.length;
    for(var i = 0; i < len; ++i) {
	    var c = str.charCodeAt(i);
	    if ((c >= 0x0001) && (c <= 0x007F))
	      out.push(str.charCodeAt(i));
	    else if (c > 0x07FF)
	      out.push(0xE0 | ((c >> 12) & 0x0F), 0x80 | ((c >>  6) & 0x3F), 0x80 | ((c >>  0) & 0x3F));
	    else
	      out.push(0xC0 | ((c >>  6) & 0x1F), 0x80 | ((c >>  0) & 0x3F));
    }
  }

  exports.utf8to16 = utf8to16;
  function utf8to16(buffer, start, end) {
    var out = "";
    var i = (start || 0) - 1;
    end = end || buffer.length;
    while(++i < end) {
	    var c = buffer[i];
	    switch(c >> 4) {
	    case 0: case 1: case 2: case 3: case 4: case 5: case 6: case 7:
	      // 0xxxxxxx
	      out += String.fromCharCode(c);
	      break;
	    case 12: case 13:
	      // 110x xxxx   10xx xxxx
	      var char2 = buffer[++i];
	      out += String.fromCharCode(((c & 0x1F) << 6) | (char2 & 0x3F));
	      break;
	    case 14:
	      // 1110 xxxx  10xx xxxx  10xx xxxx
	      var char2 = buffer[++i];
	      var char3 = buffer[++i];
	      out += String.fromCharCode(((c & 0x0F) << 12) |
					                         ((char2 & 0x3F) << 6) |
					                         ((char3 & 0x3F) << 0));
	      break;
      case 15:
        return [out, i + 1];
	    }
    }

    return [out, i ];
  }
});
