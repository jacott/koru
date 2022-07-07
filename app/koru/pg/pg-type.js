define((require, exports, module) => {
  'use strict';
  const PgDate          = require('koru/pg/pg-date');
  const PgError         = require('koru/pg/pg-error');
  const Uint8ArrayBuilder = require('koru/uint8-array-builder');
  const {qstr, identityFunc} = require('koru/util');
  const util            = require('koru/util');

  const E_INVALID_ARRAY_FORMAT = 'invalid format for array';

  const S_OPEN_BRACE = '{'.charCodeAt(0);
  const S_CLOSE_BRACE = '}'.charCodeAt(0);
  const S_DEFAULT_DELIM = ','.charCodeAt(0);
  const S_OPEN_BRACKET = '['.charCodeAt(0);
  const S_EQUALS = '='.charCodeAt(0);
  const S_QUOTE = '"'.charCodeAt(0);
  const S_BACKSLASH = '\\'.charCodeAt(0);
  const S_SPACE = ' '.charCodeAt(0);
  const S_t = 't'.charCodeAt(0);
  const S_f = 'f'.charCodeAt(0);
  const S_n = 'n'.charCodeAt(0);
  const S_N = 'N'.charCodeAt(0);
  const S_x = 'x'.charCodeAt(0);

  const MAX_DIM = 6;

  const MIN16INT = -32768;
  const MAX16INT = -1 - MIN16INT;
  const MIN32INT = 2 * (1 << 31);
  const MAX32INT = -1 - MIN32INT;

  const U8_NULL = new Uint8Array([255, 255, 255, 255]);
  const U8_TEXT_NULL = new Uint8Array([78, 85, 76, 76]);
  const U8_EMPTY_QUOTED_STRING = new Uint8Array([34, 34]);

  const coerceMap = [];

  const binaryEncoders = [];
  const binaryDecoders = [];
  const textEncoders = [];
  const textDecoders = [];
  const arrayTextEncoders = [];

  const arrayElementOids = [];
  const elementArrayOids = [];
  elementArrayOids[0] = arrayElementOids[0] = 0;

  const binaryEncoderNames = {};
  const binaryDecoderNames = {};
  const textEncoderNames = {};
  const textDecoderNames = {};
  const arrayEncoderNames = {};

  const assert = (truthy, message) => {
    if (! truthy) throw new PgError({message});
  };

  const registerName = (
    name, encodeBinary, decodeBinary,
    encodeText=encodeBinary, decodeText=decodeBinary, arrayEncodeText=encodeText,
  ) => {
    binaryEncoderNames[name] = encodeBinary;
    binaryDecoderNames[name] = decodeBinary;
    textEncoderNames[name] = encodeText;
    textDecoderNames[name] = decodeText;
    arrayEncoderNames[name] = arrayEncodeText;
  };

  const registerAliases = (name, ...aliases) => {
    for (const alias of aliases) {
      binaryEncoderNames[alias] = binaryEncoderNames[name];
      binaryDecoderNames[alias] = binaryDecoderNames[name];
      textEncoderNames[alias] = textEncoderNames[name];
      textDecoderNames[alias] = textDecoderNames[name];
      arrayEncoderNames[alias] = arrayEncoderNames[name];
    }
  };

  const registerCoerce = (from, to) => {
    const fromMap = (coerceMap[from] ??= []);
    const toMap = (coerceMap[to] ??= []);
    fromMap[to] = toMap;
    toMap.forEach((v, i) => {
      fromMap[i] = v;
    });
  };

  const findDimensions = (v) => {
    let dims = [];
    while (Array.isArray(v)) {
      dims.push(v.length);
      v = v[0];
    }
    return dims;
  };

  const binaryArrayEncoder = (b, v, oid) => {
    assert(Array.isArray(v), 'value not an array');
    const startPos = b.length;
    const dims = findDimensions(v);
    b.grow(12 + dims.length * 8);

    let hasNulls = false;

    const d = b.dataView;

    let pos = startPos;

    const elmOid = arrayElementOids[oid];
    const encode = binaryEncoders[elmOid];

    d.setInt32(0 + pos, dims.length);
    d.setInt32(8 + pos, elmOid);

    pos += 12;

    for (let i = 0; i < dims.length; ++i) {
      d.setInt32(pos, dims[i]);
      d.setInt32(pos + 4, 1);
      pos += 8;
    }

    const writeArray = (a, di) => {
      assert(a.length == dims[di], 'inconsistant array dimensions');
      if (di + 1 < dims.length) {
        for (let i = 0; i < a.length; ++i) {
          writeArray(a[i], di + 1);
        }
      } else {
        for (let i = 0; i < a.length; ++i) {
          const v = a[i];
          if (v == null) {
            hasNulls = true;
            b.append(U8_NULL);
          } else {
            b.grow(4);
            const s = b.length;
            encode(b, v, elmOid);
            b.dataView.setInt32(s - 4, b.length - s);
          }
        }
      }
    };

    writeArray(v, 0);

    b.dataView.setInt32(startPos + 4, hasNulls ? 1 : 0);
  };

  const textArrayEncoder = (b, v, oid) => {
    const delim = S_DEFAULT_DELIM;  // TODO this can be different for some types. Need to set from pg_type
    const elmOid = arrayElementOids[oid];
    const encode = arrayTextEncoders[elmOid];

    const writeArray = (ary) => {
      b.appendByte(S_OPEN_BRACE);
      let need_delim = false;
      for (const v of ary) {
        if (need_delim) {
          b.appendByte(delim);
        } else {
          need_delim = true;
        }
        if (v == null) {
          b.append(U8_TEXT_NULL);
        } else if (Array.isArray(v)) {
          writeArray(v);
        } else {
          encode(b, v, elmOid);
        }
      }
      b.appendByte(S_CLOSE_BRACE);
    };

    writeArray(v);

    return b.subarray();
  };

  const aryToSqlStr = (ary, oid=guessArrayOId(ary) ?? 199) => {
    const b = new Uint8ArrayBuilder(ary.length * 3);
    textArrayEncoder(b, ary, oid);
    return b.subarray().utf8Slice();
  };

  const binaryArrayDecoder = (v, oid) => {
    const dim = v.readInt32BE();

    if (dim == 0) return [];

    const u8Len = v.length;
    assert(dim >= 0, 'invalid number of dimensions');
    assert(dim <= MAX_DIM, `number of array dimensions exceeded`);

    const flags = v.readInt32BE(4);
    assert(flags === 0 || flags === 1, 'invalid array flags');
    const elmOid = v.readInt32BE(8);
    assert(elmOid === arrayElementOids[oid], 'array element type mismatch');
    const elmDecoder = binaryDecoders[elmOid];
    assert(elmDecoder !== void 0, () => 'Unhandled array binary format element: ' + elmOid);
    assert(binaryDecoders);
    let pos = 12 + dim * 8;
    const readArray = (cdim) => {
      const result = [];
      const len = v.readInt32BE(12 + cdim * 8);
      if (cdim == dim - 1) {
        for (let i = 0; i < len; ++i) {
          const size = v.readInt32BE(pos);
          pos += 4;
          if (size == -1) {
            result.push(null);
          } else {
            assert(size <= u8Len - pos, E_INVALID_ARRAY_FORMAT);
            result.push(elmDecoder(v.subarray(pos, pos + size), elmOid));
            pos += size;
          }
        }
      } else {
        for (let i = 0; i < len; ++i) {
          result.push(readArray(cdim + 1));
        }
      }

      return result;
    };

    return readArray(0);
  };

  const isNullToken = (v) => {
    const n = v[0];
    if ((n !== S_n && n !== S_N) || v.length != 4) return false;
    const str = v.utf8Slice();
    return str === 'NULL' || str.toUpperCase() === 'NULL';
  };

  const textArrayDecoder = (v, oid) => {
    const elmOid = arrayElementOids[oid];
    assert(elmOid !== void 0, 'unknown array element');
    const elmDecoder = textDecoders[elmOid];

    const delim = S_DEFAULT_DELIM;  // TODO this can be different for some types. Need to set from pg_type

    const len = v.length;

    let i = 0;

    const fetchToken = () => {
      if (v[i] == S_QUOTE) {
        const s = i;
        for (let j = s; i < len; ++j) {
          const n = v[++i];
          if (n === S_QUOTE) return v.subarray(s, j);
          v[j] = n === S_BACKSLASH ? v[++i] : n;
        }
        return;
      }
      for (let j = i; i < len; ++i) {
        let n = v[i];
        if (n <= S_SPACE || n === delim) {
          return v.subarray(j, i);
        } else if (n === S_CLOSE_BRACE) {
          return v.subarray(j, i--);
        }
      }
    };

    const decodeArray = () => {
      const result = [];

      while (++i < len) {
        const n = v[i];
        if (n <= S_SPACE || n === delim) continue;
        if (n === S_OPEN_BRACE) {
          result.push(decodeArray());
        } else if (n === S_CLOSE_BRACE) {
          return result;
        } else {
          const token = fetchToken();
          assert(token !== void 0, E_INVALID_ARRAY_FORMAT);
          result.push(n !== S_QUOTE && isNullToken(token) ? null : elmDecoder(token, elmOid));
        }
      }
      return result;
    };

    if (v[0] === S_OPEN_BRACKET) {
      const idx = v.indexOf(S_EQUALS);
      assert(idx != -1, E_INVALID_ARRAY_FORMAT);
      i = idx + 1;
    }

    assert(v[i] === S_OPEN_BRACE, E_INVALID_ARRAY_FORMAT);

    return decodeArray(v);
  };

  const registerOid = (name, oid, arrayOid, coerceTo) => {
    binaryEncoders[oid] = binaryEncoderNames[name];
    binaryDecoders[oid] = binaryDecoderNames[name];
    textEncoders[oid] = textEncoderNames[name];
    textDecoders[oid] = textDecoderNames[name];
    arrayTextEncoders[oid] = arrayEncoderNames[name];

    arrayElementOids[arrayOid] = oid;
    elementArrayOids[oid] = arrayOid;

    binaryEncoders[arrayOid] = binaryArrayEncoder;
    binaryDecoders[arrayOid] = binaryArrayDecoder;
    textEncoders[arrayOid] = textArrayEncoder;
    textDecoders[arrayOid] = textArrayDecoder;

    if (coerceTo !== void 0) {
      registerCoerce(oid, coerceTo);
    }
  };

  const textEncodeNative = (buf, v) => buf.appendUtf8Str(v.toString());
  const textDecodeNative = (v) => v.utf8Slice();
  const textDecodeInt = (v) => Number.parseInt(v.utf8Slice());
  const textDecodeFloat = (v) => Number.parseFloat(v.utf8Slice());

  const arrayEncodeText = (buf, v) => {
    if (v.length == 0) {
      buf.append(U8_EMPTY_QUOTED_STRING);
    } else if (/["\s,{}\\]/.test(v) || (v.length == 4 && v.toUpperCase() === 'NULL')) {
      buf.appendUtf8Str(JSON.stringify(v));
    } else {
      buf.appendUtf8Str(v.toString());
    }
  };

  const fromHex = (c) => c > 96 ? c - 87 : c > 64 ? c - 55 : c - 48;

  const textByteaToU8 = (v) => {
    const len = (v.length >> 1) - 1;
    const u8 = new Uint8Array(len);
    let j = 1;
    for (let i = 0; i < len; ++i) {
      u8[i] = fromHex(v[++j]) * 16 + fromHex(v[++j]);
    }

    return u8;
  };

  const u8ToTextBytea = (buf, v) => {
    buf.appendByte(S_BACKSLASH).appendByte(S_x);
    for (let i = 0; i < v.length; ++i) {
      let nh = v[i] >> 4;
      let nl = v[i] & 15;

      buf.appendByte(nh < 10 ? nh + 48 : nh + 87).appendByte(nl < 10 ? nl + 48 : nl + 87);
    }
  };

  registerName('char', (buf, v) => buf.appendByte(v.toString().charCodeAt(0) ?? 0), (v) => String.fromCharCode(v[0]));

  registerName('text', textEncodeNative, textDecodeNative, textEncodeNative, textDecodeNative, arrayEncodeText);
  registerAliases('text', 'name', 'varchar', 'bpchar');
  registerOid('text', 25, 1009);
  registerOid('name', 19, 1003);

  registerName('bytea', (buf, v) => buf.append(v), identityFunc,
               u8ToTextBytea, textByteaToU8);
  registerOid('bytea', 17, 1001);

  const setBool = (buf, v) => buf.appendByte(v ? 1 : 0);
  const getBool = (v) => v[0] != 0;
  const setInt32 = (buf, v) => buf.writeInt32BE(v);
  const getInt32 = (v) => v.readInt32BE(0);
  const setInt64 = (buf, v) => buf.writeBigInt64BE(BigInt(v));
  const getInt64 = (v) => Number(v.readBigInt64BE(0));
  const getBigInt64 = (v) => v.readBigInt64BE(0);

  const setJsonb = (buf, v) => buf.appendByte(1).append(Buffer.from(JSON.stringify(v)));
  const getJsonb = (v) => JSON.parse(v.subarray(1));
  const setJson = (buf, v) => buf.append(Buffer.from(JSON.stringify(v)));
  const getJson = (v) => JSON.parse(v);

  const setJsonText = (v) => Buffer.from(JSON.stringify(v));

  registerName('bool', setBool, getBool,
               (buf, v) => buf.append(v ? S_t : S_f),
               (v) => v[0] != S_f);
  registerOid('bool', 16, 1000);

  registerName('int2',
               (buf, v) => buf.writeInt16BE(v),
               (v) => v.readInt16BE(0),
               textEncodeNative,
               textDecodeInt);
  registerOid('int2', 21, 1005, 23);

  registerName('int4', setInt32, getInt32, textEncodeNative, textDecodeInt);
  registerOid('int4', 23, 1007, 20);

  registerName('int8', setInt64, getInt64, textEncodeNative, textDecodeInt);
  registerOid('int8', 20, 1016);

  registerName('float4',
               (buf, v) => buf.writeFloatBE(v),
               (v) => v.readFloatBE(0),
               textEncodeNative,
               textDecodeFloat);
  registerOid('float4', 700, 1021, 701);

  registerName('float8',
               (buf, v) => buf.writeDoubleBE(v),
               (v) => v.readDoubleBE(0),
               textEncodeNative,
               textDecodeFloat);
  registerOid('float8', 701, 1022);

  registerName('jsonb', setJsonb, getJsonb, setJson, getJson);
  registerOid('jsonb', 3802, 3807);
  registerName('json', setJson, getJson, setJson, getJson);
  registerOid('json', 114, 199);

  const NULL_BIN = [25, 1, null];

  const guessOid = (obj) => {
    if (obj == null) return 25;
    let oid = 0;
    switch (typeof obj) {
    case 'boolean': return 16;
    case 'bigint': return 20;
    case 'number':
      if (obj === Math.floor(obj)) {
        return obj > MAX32INT
          ? (obj === Infinity ? 701 : 20)
          : (obj > MAX16INT
             ? 23
             : (obj >= MIN16INT
                ? 21
                : (obj >= MIN32INT
                   ? 23
                   : obj === -Infinity ? 701 : 20)));
      } else {
        return 701;
      }
    case 'string': return 25;
    case 'object':
      const {constructor} = obj;
      if (constructor === Uint8Array || constructor === Buffer) return 17;
      if (constructor === Date) return 1114;
      if (Array.isArray(obj)) return guessArrayOId(obj) ?? 3802;
      return 3802;
    }
  };

  const coerce = (from, to) => coerceMap[from]?.[to] && to;

  const guessArrayOId = (ary) => {
    if (ary.length == 0) return 1009;
    const dims = [];

    let oid = void 0;

    const checkIndexs = (ary, depth) => {
      for (const n of ary) {
        if (n == null) continue;
        if (Array.isArray(n)) {
          if (depth < dims.length) {
            if (n.length !== dims[depth]) {
              oid = -1;
              return;
            }
          } else {
            dims.push(n.length);
          }
          checkIndexs(n, depth + 1);
        } else {
          const c = guessOid(n);
          if (c === void 0) return;
          if (oid == void 0) {
            oid = c;
          } else if (oid != c) {
            oid = coerce(oid, c) ?? coerce(c, oid) ?? -1;
            return;
          }
        }
      }
    };

    checkIndexs(ary, 0);

    if (oid !== void 0 && oid != -1) {
      return elementArrayOids[oid];
    }
  };

  const PgType = {
    encodeText: (buf, v, oid) => {
      buf.grow(4);
      const s = buf.length;
      v == null ? buf.append(U8_TEXT_NULL) : textEncoders[oid](buf, v, oid);
      buf.dataView.setInt32(s - 4, buf.length - s);
      return oid;
    },
    decodeText: (oid, v) => (textDecoders[oid] ?? textDecodeNative)(v, oid),
    encodeBinary: (buf, v, oid) => {
      if (v == null) {
        buf.append(U8_NULL);
      } else {
        buf.grow(4);
        const s = buf.length;
        const encoder = binaryEncoders[oid];
        assert(encoder !== void 0, () => `${oid} not in binaryEncoders`);
        encoder(buf, v, oid);
        buf.writeInt32BE(buf.length - s, s - 4);
      }
      return oid;
    },
    decodeBinary: (oid, v) => binaryDecoders[oid]?.(v, oid),

    registerName,
    registerOid,
    registerAliases,
    registerCoerce,

    textDecoders,
    textEncoders,
    binaryDecoders,
    binaryEncoders,
    arrayTextEncoders,

    toArrayOid: (oid) => elementArrayOids[oid],
    fromArrayOid: (oid) => arrayElementOids[oid],

    guessOid: (v) => {
      const oid = guessOid(v);
      if (oid === void 0) throw new Error('unsupported javascript type ' + util.inspect(v));
      return oid;
    },

    aryToSqlStr,

    escapeLiteral: (str) => {
      if (typeof str === 'number') {
        return "'" + str.toString() + "'";
      } else {
        const i = str.indexOf("\u0000");
        if (i !== -1) str = str.slice(0, i);
        str = str.toString().replace("'", "''");
        const be = str.replace('\\', '\\\\');
        return (be !== str ? " E'" : "'") + be + "'";
      }
    },

    async assignOids(conn) {
      const query = conn.execRows(`select oid::int,typname,typarray::int,typinput from pg_type where typarray <> 0`);
      while (query.isExecuting) {
        let count = 0;
        await query.fetch((n) => {
          registerOid(n.typname, n.oid, n.typarray);
        });
        query.getCompleted();
      }
    },
  };

  const helpers = {setInt32, getInt32, setInt64, getBigInt64, textDecodeInt};

  PgDate.register(PgType, helpers);

  return PgType;
});
