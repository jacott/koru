define((require, exports, module) => {
  'use strict';
  const Uint8ArrayBuilder = require('koru/uint8-array-builder');
  const util            = require('koru/util');
  const {PgMessage, PgRow, simpleCmd, buildColumns, utf8Encode} = require('./pg-util');

  const {private$, inspect$} = require('koru/symbols');

  const P_PARSE = 10;
  const P_PARSED = 11;
  const P_BIND = 20;
  const P_BOUND = 21;
  const P_EXECUTE = 30;
  const P_CLOSING = 40;
  const P_CLOSED = 50;
  const P_NEW = 60;

  const E_MISSING_PREPARE_VALUES = 'missing PgPortal#prepareValues';
  const E_MISSING_PARSE = 'missing PgPortal#parse';
  const E_PARAM_COUNT_MISMATCH = 'PgPortal#addParamOid call count does not match parse paramCount';
  const E_BAD_PARSE_ARGS = 'invalid arguments: usage parse(name:string, query:string, paramCount:number)';

  const FLUSH = simpleCmd('H');
  const SYNC = simpleCmd('S');

  const [
    PCMD, BCMD, DCMD, ECMD,
  ] = 'PBDE'.split('').map((c) => c.charCodeAt(0));

  const BINARY_CODES = [1];

  const portalListen = async (portal, init, complete) => {
    const pv = portal[private$];
    const {conn} = portal;

    const currentState = pv.state;

    const ready = () => {
      conn.unlock();
      if (pv.state === P_CLOSING) pv.state = P_CLOSED;
      complete(portal.error);
      return true;
    };

    const describing = currentState === pv.describeState;
    pv.describeState = void 0;

    const stateFunction = (state) => () => {
      pv.completeState = state;
      if (currentState === state && ! describing) {
        ready();
      }
      return true;
    };

    pv.raw ??= {desc: void 0, row: void 0};
    const row = new PgRow(pv.raw);

    await conn.lock({
      ready,
      error: (err) => {
        portal.error ??= err;
        if (err.severity === 'FATAL') {
          ready();
          return;
        }
        pv.u8b.length = 0;
        if (pv.state < P_EXECUTE) {
          conn.socket.write(SYNC);
        } else if (pv.state === P_EXECUTE) {
          pv.state = P_CLOSING;
        }
        return true;
      },
      addRowDesc: (data) => {
        if (portal.error !== void 0) return true;
        pv.raw.columns = void 0;
        pv.raw.desc = data;
        if (describing) ready();
        return true;
      },
      addRow: (data) => {
        if (portal.error !== void 0) return true;
        try {
          pv.raw.row = data;
          return pv.nextRow !== void 0 && pv.nextRow(row) !== false;
        } catch (err) {
          portal.error ??= err;
          return true;
        }
      },
      commandComplete: (data) => {
        if (portal.error !== void 0) return true;
        pv.complete = data;
        return true;
      },
      parseComplete: stateFunction(P_PARSED),
      bindComplete: stateFunction(P_BOUND),
    });

    if (pv.state === P_CLOSED) {
      conn.unlock();
      complete();
      return;
    }

    if (init() === false) {
      conn.unlock();
    }
  };

  const finishParse = (portal, pv) => {
    if (pv.state !== P_PARSE) return;
    pv.state = P_PARSED;
    const {u8b} = pv;

    const u8 = pv.u8b.subarray();

    let pos = pv.parsePos + 1;
    const dv = u8b.dataView;
    dv.setInt32(pos, u8b.length - pos);
    pos += portal.queryU8.length + 1+5;
    dv.setInt16(pos, (u8b.length - pos - 2) >> 2);
  };

  const finishBind = (portal, pv, resultFormatAdded=false) => {
    if (pv.state !== P_BIND) return;
    assert(pv.paramsAdded == pv.paramCount, E_PARAM_COUNT_MISMATCH);
    pv.state = P_BOUND;
    const {u8b} = pv;
    resultFormatAdded || u8b.grow(2);
    let pos = pv.bindPos + 1;
    const dv = u8b.dataView;
    dv.setInt32(pos, u8b.length - pos);
  };

  class PgPortal {
    constructor(conn, portalName) {
      this.conn = conn;
      this.isClosed = false;
      this.name = portalName;
      this.u8name = utf8Encode(portalName);
      this[private$] = {
        state: P_NEW,
        u8b: new Uint8ArrayBuilder(0),
      };
    }

    [inspect$]() {return `PgPortal(${this.name})`}

    parse(name='', query, paramCount) {
      assert(typeof query === 'string' && typeof paramCount === 'number' && paramCount >= 0, E_BAD_PARSE_ARGS);
      const pv = this[private$];
      assert(pv.state === P_NEW, 'parse may only be called on new portal');

      pv.paramCount = paramCount;
      pv.paramsAdded = 0;
      this.psName = name;
      pv.state = P_PARSE;
      const {u8b} = pv;

      pv.parsePos = u8b.length;

      const psU8name = this.psU8name = utf8Encode(name);
      const u8query = this.queryU8 = utf8Encode(query);

      u8b.grow(7 + psU8name.length + u8query.length + 2);

      const u8 = u8b.subarray();
      u8[0] = PCMD;
      u8.set(psU8name, 5);
      let pos = 6 + psU8name.length;
      u8.set(u8query, pos);
      return this;
    }

    addParamOid(oid) {
      const pv = this[private$];

      if (pv.state === P_PARSE) {
        pv.u8b.writeInt32BE(oid);
      } else if (pv.state === P_BIND) {
        pv.u8b.dataView.setInt32(pv.paramOidPos + (pv.paramsAdded) * 4, oid);
      } else {
        throw new Error('addParamOid may not be used here; use after parse/prepareValues');
      }

      assert(++pv.paramsAdded <= pv.paramCount, E_PARAM_COUNT_MISMATCH);

      return this;
    }

    prepareValues(formatCodes=BINARY_CODES) {
      if (this.error !== void 0) return;

      const pv = this[private$];
      const {u8b} = pv;
      const cState = pv.state;
      if (cState === P_PARSE) {
        pv.paramOidPos = u8b.length - (pv.paramsAdded * 4);
        u8b.grow(4 * (pv.paramCount - pv.paramsAdded));
        finishParse(this, pv);
      } else {
        assert(cState === P_PARSED, 'prepareValues may only be called on a parsed portal');
      }

      const {psU8name, u8name} = this;

      let pos = pv.bindPos = u8b.length;

      u8b.grow(psU8name.length + u8name.length + 5+2+2 + (formatCodes.length) * 2 + 2, pv.paramCount * 6);

      const u8 = u8b.subarray();
      const dv = u8b.dataView;
      u8[pos] = BCMD;
      u8.set(u8name, pos + 5);
      pos += 6 + u8name.length;
      u8.set(psU8name, pos);
      dv.setInt16(pos += 1 + psU8name.length, formatCodes.length);
      for (const code of formatCodes) dv.setInt16(pos += 2, code);
      dv.setInt16(pos += 2, pv.paramCount);
      pv.state = P_BIND;

      return u8b;
    }

    addResultFormat(resultCodes=BINARY_CODES) {
      const pv = this[private$];
      assert(pv.state === P_BIND, E_MISSING_PREPARE_VALUES);

      const {u8b} = pv;

      let pos = u8b.length;
      u8b.grow(2 + resultCodes.length * 2);
      const dv = u8b.dataView;

      dv.setInt16(pos, resultCodes.length);
      for (const code of resultCodes) dv.setInt16(pos += 2, code);

      finishBind(this, pv, true);
    }

    describe() {
      if (this.error !== void 0) return;
      const pv = this[private$];

      finishParse(this, pv);
      finishBind(this, pv);

      const {u8name} = this;

      pv.describeState = pv.state;
      const {u8b} = pv;

      let pos = u8b.length;

      let len = 6 + u8name.length + 1;

      u8b.grow(len);
      const u8 = u8b.subarray(pos);
      const dv = new DataView(u8.buffer, u8.byteOffset);
      u8[0] = DCMD;
      dv.setInt32(1, u8.length - 1);
      u8[5] = PCMD;
      u8.set(u8name, 6);
    }

    execute(maxRows=0) {
      const portal = this;
      if (portal.error !== void 0) return;
      const pv = portal[private$];

      finishParse(portal, pv);
      finishBind(portal, pv);

      assert(pv.state === P_BOUND, E_MISSING_PREPARE_VALUES);

      const cpv = portal.conn[private$];

      pv.state = P_EXECUTE;

      let execState = 1;

      return {
        fetch: (callback) => {
          if (pv.state != P_EXECUTE || execState != 1) return;

          return new Promise((resolve) => portalListen(
            portal, () => {
              if (pv.state !== P_EXECUTE || execState != 1) {
                resolve(this.error);
                return false;
              }
              const {u8name} = portal;
              const {u8b} = pv;

              let pos = u8b.length;

              let len = 5 + u8name.length + 1+4;
              u8b.grow(len);
              let u8 = u8b.subarray(pos);
              const dv = new DataView(u8.buffer, u8.byteOffset);

              u8[0] = ECMD;
              dv.setInt32(1, u8.length - 1);
              u8.set(u8name, 5);

              if (maxRows !== 0) {
                dv.setInt32(u8 - 4, maxRows);
              }

              pv.u8b.append(SYNC);

              portal.conn.socket.write(pv.u8b.subarray());
              pv.u8b.length = 0;

              pv.nextRow = callback;
            }, () => {
              execState = 0;
              pv.state = P_CLOSED;
              resolve(this.error);
            }));
        },

        close: (err) => {
          portal.error ??= err;
          if (execState != 2) {
            if (execState == 1) {
              execState = -1;
              pv.state = P_CLOSED;
            }
            return portal.error;
          }

          execState = -1;
          return new Promise((res) => {
            pv.nextRow = util.voidFunc;
            cpv.sendNext();
          });
        },

        getCompleted: () => {
          const result = pv.complete && pv.complete.subarray(0, -1).utf8Slice();
          pv.isExecuting && cpv.sendNext();
          return result;
        },
        get isExecuting() {return execState > 0},
        get error() {return portal.error},
      };
    }

    flush() {
      if (this.error !== void 0) return;
      const pv = this[private$];
      if (pv.state >= P_EXECUTE) return;

      finishParse(this, pv);
      finishBind(this, pv);

      return new Promise((resolve) => portalListen(this, () => {
        if (this.error !== void 0 || pv.state >= P_EXECUTE) {
          resolve(this.error);
          return false;
        }

        pv.u8b.append(FLUSH);
        this.conn.socket.write(pv.u8b.subarray());
        pv.u8b.length = 0;
      }, resolve));
    }

    close() {
      const pv = this[private$];

      const {state} = pv;

      pv.u8b.length = 0;
      if (state >= P_EXECUTE) {
        if (state === P_EXECUTE) pv.state = P_CLOSING;
        return;
      }

      pv.state = P_CLOSING;

      return new Promise((resolve) => portalListen(this, () => {
        this.conn.socket.write(SYNC);
      }, resolve));
    }

    getColumn(n) {
      const pv = this[private$];
      return (pv.columns ??= buildColumns(pv.raw))[n];
    }
  }

  return PgPortal;
});
