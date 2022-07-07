define((require, exports, module) => {
  'use strict';
  const util            = require('koru/util');

  const {inspect$, private$} = require('koru/symbols');

  const listener$ = Symbol();

  const State = {
    NEW_CONN: 0,
    CONNECTING: 1,
    EXECUTING: 2,
    READY: 4,
    READY_IN_TRANSACTION: 5,
    READY_IN_ROLLBACK: 6,
    CLOSED: -1,
  };

  const MessageMap = {
    S: 'severity',
    V: 'severity',
    C: 'code',
    M: 'message',
    D: 'detail',
    H: 'hint',
    P: 'position',
    F: 'file',
    L: 'line',
    R: 'routine',
  };

  const MessageNumberMap = {
    P: true,
    L: true,
  };

  class PgMessage {
    [inspect$]() {
      return `PgMessage({${this.severity}: ${util.qstr(this.message)}, code: "${this.code}"})`;
    }

    static readFields = (data) => {
      const message = new PgMessage();
      let i = 0;
      while (data[i] != 0) {
        const key = String.fromCharCode(data[i]);
        const np = data.indexOf(0, ++i);
        if (i == -1) break;
        const value = data.subarray(i, np).toString();
        message[MessageMap[key] ?? key] = MessageNumberMap[key] === void 0 ? value : +value;
        i = np + 1;
      }
      return message;
    };
  }

  PgMessage.prototype.severity = 'FATAL';
  PgMessage.prototype.code = '500';
  PgMessage.prototype.message = 'Unexpected result';

  class PgColumn {
    #name = void 0;
    constructor(raw, index, name, pos) {
      this.raw = raw;
      this.index = index;
      this.name = name;
      this.pos = pos;
    }

    get oid() {return this.raw.descDv.getInt32(this.pos + 6)}
    get size() {return this.raw.descDv.getInt16(this.pos + 10)}
    get typeModifier() {return this.raw.descDv.getInt32(this.pos + 12)}
    get format() {return this.raw.descDv.getInt16(this.pos + 16)}
  }

  const buildColumns = (raw) => {
    const columns = [];

    const u8 = raw.desc;
    const dv = raw.descDv ??= new DataView(u8.buffer, u8.byteOffset);
    const len = dv.getInt16(0);

    let pos = 2, strEnd = -1;

    for (let i = 0; i < len; ++i) {
      strEnd = u8.indexOf(0, pos);

      const col = new PgColumn(raw, i, u8.subarray(pos, strEnd).toString(), strEnd + 1);
      columns.push(col);
      pos = strEnd + 19;
    }

    return columns;
  };

  class PgRow {
    constructor(rawRow) {
      this[private$] = rawRow;
    }

    *[Symbol.iterator]() {
      const raw = this[private$];
      const columns = raw.columns ??= buildColumns(raw);
      const u8 = raw.row;
      const dv = new DataView(u8.buffer, u8.byteOffset);
      let pos = 2;
      for (let i = 0; i < columns.length; ++i) {
        const desc = columns[i];
        const flen = dv.getInt32(pos);
        pos += 4;
        if (flen == -1) {
          yield {desc, rawValue: null};
        } else {
          const rawValue = u8.subarray(pos, pos + flen);
          yield {desc, rawValue};
          pos += flen;
        }
      }
    }
  }

  const simpleCmd = (char) => new Uint8Array([char.charCodeAt(0), 0, 0, 0, 4]);

  return {
    PgMessage,
    PgRow,
    State,
    listener$,
    simpleCmd,
    buildColumns,
    utf8Encode: (v) => Buffer.from(v.toString()),
  };
});
