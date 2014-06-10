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

  var tSmString = 0x80;
  var tSmNumber = 0x40;

  var tmpAb = new ArrayBuffer(8);
  var tmpDv = new DataView(tmpAb);
  var tmpU8 = new Uint8Array(tmpAb);

  var forEachFunc = Array.prototype.forEach;
  var toStringFunc = Object.prototype.toString;

  exports.encodeMessage = function (type, args) {
    var buffer = [];
    var dict = {};

    args.forEach(function (o) {
      encode(buffer, o, dict);
    });

    var last;
    while((last = buffer.pop()) === 0) {}
    if (last !== undefined)
      buffer.push(last);

    dict = encodeDict(dict, [type.charCodeAt(0)]);

    var result = new Uint8Array(dict.length + buffer.length);
    result.set(dict, 0);
    result.set(buffer, dict.length);

    return result;
  },

  exports.decodeMessage = function (u8) {
    var dict = {};
    var index = decodeDict(u8, 0, dict);

    var len = u8.length;
    var out = [];
    for(;index < len; index = result[1]) {
      var result = decode(u8, index, dict);
      out.push(result[0]);
    }

    return out;
  },

  exports._encode =  function (object) {
    var buffer = [];
    var dict = {};
    encode(buffer, object, dict);
    if (dict.index)
      return encodeDict(dict, [tDict]).concat(buffer);
    else
      return buffer;
  };
  function encode(buffer, object, dict) {
    switch(typeof object) {

    case 'string':
      if (object === '')
        return buffer.push(tEmptyString);

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
        return forEachFunc.call(tmpU8.subarray(0, 4), function (v) {
          buffer.push(v);
        });
      }

      // up to 4 decimals
      tmpDv.setInt32(0, object*10000);
      if (tmpDv.getInt32(0) === object*10000) {
        buffer.push(tDec4);
        return forEachFunc.call(tmpU8.subarray(0, 4), function (v) {
          buffer.push(v);
        });
      }

      tmpDv.setFloat64(0, object);

      buffer.push(tFloat64);
      return forEachFunc.call(tmpU8, function (v) {
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
      return forEachFunc.call(tmpU8, function (v) {
        buffer.push(v);
      });
    case "[object Array]":
      buffer.push(tArray);
      object.forEach(function (o) {
        encode(buffer, o, dict);
      });
      return buffer.push(tTerm);
    case "[object Uint8Array]":
      buffer.push(tBinary);
      tmpDv.setInt32(0, object.byteLength);
      forEachFunc.call(tmpU8.subarray(0, 4), function (v) {
        buffer.push(v);
      });
      return forEachFunc.call(object, function (v) {
        buffer.push(v);
      });
    }

    buffer.push(tObject);
    for(var key in object) {
      var dkey = addToDict(dict, key);
      buffer.push(dkey >> 8, dkey % 0x100);

      encode(buffer, object[key], dict);
    }
    buffer.push(tTerm);
  }

  exports.addToDict = addToDict;
  function addToDict(dict, name) {
    var k2c = dict.k2c || (dict.k2c = {});
    var code = k2c[name];
    if (code) return code;

    var index = dict.index || 0;
    dict.index = index + 1;

    if (index === (1 << 15) - 0x80) throw new Error("Dictionary overflow");

    code = k2c[name] = ((index % 0x80) + 0x80 << 8) + (index >> 7);

    index += 0x80;

    var c2k = dict.c2k || (dict.c2k = {});
    var key = String.fromCharCode(index % 0x100);
    var val = c2k[key];
    if (! val) {
      c2k[key] = [name];
      return code;
    }
    val[index >> 8] = name;
    return code;
  }

  exports.encodeDict = encodeDict;
  function encodeDict(dict, buffer) {
    var index = dict.index + 0x80;
    var c2k = dict.c2k;
    for(var i = 0x80; i < index; ++i) {
      var val = c2k[String.fromCharCode(i % 0x100)];
      val = val[i >> 8];

      utf16to8(buffer, val);
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

  exports.getDictItem = getDictItem;
  function getDictItem(dict, code) {
    return dict.c2k[String.fromCharCode(code >> 8)][code % 0x100];
  }

  exports._decode = function (object) {
    return decode(object, 0, {})[0];
  };
  function decode(buffer, index, dict) {
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
      var len = tmpDv.getInt32(0);
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
