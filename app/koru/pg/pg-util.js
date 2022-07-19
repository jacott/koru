define((require, exports, module) => {
  'use strict';
  const util            = require('koru/util');

  const {inspect$} = require('koru/symbols');

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
        if (np == -1) break;
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

  const buildNameOidColumns = (u8) => {
    const columns = [];

    const dv = new DataView(u8.buffer, u8.byteOffset);
    const len = dv.getInt16(0);

    let pos = 2, strEnd = -1;

    for (let i = 0; i < len; ++i) {
      strEnd = u8.indexOf(0, pos);
      columns.push({
        name: u8.subarray(pos, strEnd).toString(),
        oid: dv.getInt32(strEnd + 7), format: dv.getInt16(strEnd + 17)});
      pos = strEnd + 19;
    }

    return columns;
  };

  const getRow = (columns, getValue, rawRow, excludeNulls=true) => {
    const row = {};
    forEachColumn(rawRow, (rawValue, i) => {
      const desc = columns[i];
      const value = getValue(desc, rawValue);
      if (! excludeNulls || value !== null) {
        row[desc.name] = value;
      }
    });
    return row;
  };

  const forEachColumn = (u8, callback) => {
    const dv = new DataView(u8.buffer, u8.byteOffset);
    const len = dv.getInt16(0);
    let pos = 2;
    for (let i = 0; i < len; ++i) {
      const flen = dv.getInt32(pos);
      pos += 4;
      if (flen == -1) {
        callback(null, i);
      } else {
        callback(u8.subarray(pos, pos + flen), i);
        pos += flen;
      }
    }
  };

  const simpleCmd = (char) => new Uint8Array([char.charCodeAt(0), 0, 0, 0, 4]);

  return {
    PgMessage,
    State,
    simpleCmd,
    forEachColumn,
    buildNameOidColumns,
    getRow,
    utf8Encode: (v) => Buffer.from(v.toString()),
    listener$,
  };
});
