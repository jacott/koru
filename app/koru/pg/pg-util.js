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
    constructor() {}

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

    static fatal(message) {
      const m = new PgMessage();
      m.message = message;
      return m;
    }

    static error(message) {
      const m = new PgMessage();
      m.severity = 'ERROR';
      m.message = message;
      return m;
    }
  }

  PgMessage.prototype.severity = 'FATAL';
  PgMessage.prototype.code = '500';
  PgMessage.prototype.message = 'Unexpected result';

  const COL_FIELDS = {
    name: (u8, pos, strEnd) => u8.utf8Slice(pos, strEnd),
    order: (u8, pos, strEnd) => u8.readInt16BE(strEnd + 5),
    oid: (u8, pos, strEnd) => u8.readInt32BE(strEnd + 7),
    size: (u8, pos, strEnd) => u8.readInt16BE(strEnd + 11),
    mod: (u8, pos, strEnd) => u8.readInt32BE(strEnd + 13),
    format: (u8, pos, strEnd) => u8.readInt16BE(strEnd + 17),
  };

  const buildNameOidColumns = (u8) => {
    const columns = [];

    const len = u8.readInt16BE(0);
    let pos = 2, strEnd = -1;

    for (let i = 0; i < len; ++i) {
      strEnd = u8.indexOf(0, pos);
      columns.push({
        name: u8.utf8Slice(pos, strEnd),
        oid: u8.readInt32BE(strEnd + 7),
        format: u8.readInt16BE(strEnd + 17)});
      pos = strEnd + 19;
    }

    return columns;
  };

  const buildColumns = (u8, fields) => {
    const columns = [];

    const len = u8.readInt16BE(0);
    let pos = 2, strEnd = -1;

    for (let i = 0; i < len; ++i) {
      strEnd = u8.indexOf(0, pos);
      const col = {};
      for (const name of fields) {
        col[name] = COL_FIELDS[name](u8, pos, strEnd);
      }
      columns.push(col);
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
    const len = u8.readInt16BE(0);
    let pos = 2;
    for (let i = 0; i < len; ++i) {
      const flen = u8.readInt32BE(pos);
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
    buildColumns,
    getRow,
    utf8Encode: (v) => Buffer.from(v.toString()),
    listener$,
  };
});
