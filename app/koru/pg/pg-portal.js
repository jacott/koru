define((require, exports, module) => {
  'use strict';
  const Uint8ArrayBuilder = require('koru/uint8-array-builder');
  const util            = require('koru/util');
  const {PgMessage, simpleCmd, utf8Encode, State} = require('./pg-util');

  const {private$, inspect$} = require('koru/symbols');

  const P_LOCKED = 1;
  const P_CLOSED = 2;
  const P_DATA_SENT = 4;
  const P_PARSE_START = 8;
  const P_PARSED = 16;
  const P_BIND_START = 32;
  const P_BOUND = 64;
  const P_FETCHING = 128;
  const P_MORE = 256;

  const E_MISSING_PREPARE_VALUES = 'missing PgPortal#prepareValues';
  const E_MISSING_PARSE = 'missing PgPortal#parse';
  const E_PARAM_COUNT_MISMATCH = 'PgPortal#addParamOid call count does not match parse paramCount';
  const E_BAD_ARGS = 'invalid arguments';

  const SYNC = simpleCmd('S');

  const ZERO32 = new Uint8Array(4);

  const [
    CBYTE, PBYTE, SBYTE, BBYTE, DBYTE, EBYTE,
  ] = 'CPSBDE'.split('').map((c) => c.charCodeAt(0));

  const BINARY_CODES = [1];

  class PortalState {
    constructor(portal) {
      this.portal = portal;
      this.state = 0;
      this.u8b = new Uint8ArrayBuilder(0);
      this.rowDescCallback = void 0;
    }

    get conn() {return this.portal.conn}

    get isClosed() {return (this.state & P_CLOSED) != 0}
    get canFetch() {return ! this.isState(P_FETCHING | P_LOCKED | P_CLOSED) || this.isState(P_MORE, P_LOCKED | P_CLOSED)}

    setClosed() {
      this.state = P_CLOSED | (this.state & ~(P_FETCHING | P_MORE));
    }

    send(u8=this.u8b.subarray()) {
      this.setState(P_DATA_SENT);
      this.conn.socket.write(u8);
      this.u8b.length = 0;
    }

    done() {}

    closePortal() {
      const {portal} = this;
      if (this.isClosed) return portal.error;
      if (! this.isState(P_DATA_SENT)) {
        this.setClosed();
        return portal.error;
      }
      return new Promise((resolve) => {
        this.nextRow = void 0;
        if (this.isState(P_LOCKED)) {
          const done = this.done;
          this.done = (error) => {
            done(error);
            this.closePortal().resolve(error);
          };
        } else {
          return lockPortal(
            portal,
            () => {
              this.setClosed();
              const b = this.u8b;
              b.length = 0;
              b.appendByte(CBYTE).writeInt32BE(4+1 + portal.u8name.length + 1);
              b.appendByte(PBYTE).append(portal.u8name).appendByte(0);
              b.append(SYNC);
              this.send();
              portal.conn[private$].sendNext();
              resolve(portal.error);
            },
            resolve,
          );
        }
      });
    }

    closeComplete() {
      this.setClosed();
      return true;
    }

    isState(allow, disallow=0) {return (this.state & allow) != 0 && (this.state & disallow) == 0}
    clearState(mask) {this.state &= ~mask}
    setState(mask) {this.state |= mask}

    ready() {
      this.done(this.portal.error);
      return true;
    }

    error(err) {
      this.portal.error ??= err;
      this.nextRow = void 0;
      this.setClosed();
      return true;
    }
    addRowDesc(data) {
      if (this.isClosed) return true;
      return this.rowDescCallback?.(data) !== false;
    }
    addParameterDescription(data) {
      if (this.portal.error !== void 0) return true;
      // TODO GJ
      return true;
    }
    addRow(data) {
      if (this.portal.error !== void 0) return true;
      try {
        return this.nextRow !== void 0 && this.nextRow(data) !== false;
      } catch (err) {
        this.portal.error ??= err;
        return true;
      }
    }
    portalSuspended() {
      this.setState(P_MORE);
      return true;
    }
    commandComplete(data) {
      if (this.portal.error !== void 0) return true;
      this.ccCallback?.(data.utf8Slice(0, data.length - 1));
      return true;
    }
  }

  PortalState.prototype.parseComplete = util.trueFunc;
  PortalState.prototype.bindComplete = util.trueFunc;

  const unlockPortal = (pv) => {
    if (pv.isState(P_LOCKED)) {
      pv.portal.conn.unlock();
      pv.clearState(P_LOCKED);
    }
  };

  const lockPortal = async (portal, init, done) => {
    const pv = portal[private$];
    assert(! pv.isState(P_LOCKED));
    pv.setState(P_LOCKED);

    pv.done = (err) => {
      portal.error ??= err;
      unlockPortal(pv);

      if (! pv.isClosed) {
        if (portal.name === '' && (portal.conn.state !== State.READY_IN_TRANSACTION || ! pv.isState(P_MORE))) {
          pv.setClosed();
        }
      }
      done(portal.error);
    };

    await portal.conn.lock(pv);

    if (pv.isClosed) {
      unlockPortal(pv);
      done(portal.error);
      return;
    }

    if (init() === false) {
      unlockPortal(pv);
    }
  };

  const finishParse = (portal, pv) => {
    if (! pv.isState(P_PARSE_START, P_CLOSED)) return;
    pv.setState(P_PARSED);
    pv.clearState(P_PARSE_START);
    const {u8b} = pv;

    let pos = pv.parsePos + 1;
    u8b.writeInt32BE(u8b.length - pos, pos);
    pos += portal.queryU8.length + portal.psU8name.length + 6;
    u8b.writeInt16BE((u8b.length - pos - 2) >> 2, pos);
  };

  const finishBind = (portal, pv, resultFormatAdded=false) => {
    if (! pv.isState(P_BIND_START, P_CLOSED)) return;
    assert(pv.paramsAdded == pv.paramCount, E_PARAM_COUNT_MISMATCH);
    pv.setState(P_BOUND);
    pv.clearState(P_BIND_START);
    const {u8b} = pv;
    resultFormatAdded || u8b.appendByte(0).appendByte(0);
    let pos = pv.bindPos + 1;
    u8b.writeInt32BE(u8b.length - pos, pos);
  };

  const prepValues = (portal, formatCodes) => {
    const pv = portal[private$];
    const {u8b} = pv;
    const {psU8name, u8name} = portal;

    pv.bindPos = u8b.length;

    u8b.appendByte(BBYTE).append(ZERO32)
      .append(u8name).appendByte(0)
      .append(psU8name).appendByte(0);

    u8b.writeInt16BE(formatCodes.length);
    for (const code of formatCodes) u8b.writeInt16BE(code);

    u8b.writeInt16BE(pv.paramCount);
    pv.setState(P_BIND_START);

    return u8b;
  };

  class PgPortal {
    constructor(conn, portalName) {
      this.conn = conn;
      this.name = portalName;
      this.u8name = utf8Encode(portalName);
      this[private$] = new PortalState(this);
    }

    [inspect$]() {return `PgPortal(${this.name})`}

    get isClosed() {return this[private$].isClosed}

    parse(name='', query, paramCount) {
      assert(typeof query === 'string' && typeof paramCount === 'number' && paramCount >= 0, E_BAD_ARGS);
      const pv = this[private$];
      assert(pv.state == 0, 'parse may only be called on new portal');
      pv.setState(P_PARSE_START);

      pv.paramCount = paramCount;
      pv.paramsAdded = 0;
      this.psName = name;
      const {u8b} = pv;

      pv.parsePos = u8b.length;

      const psU8name = this.psU8name = utf8Encode(name);
      const u8query = this.queryU8 = utf8Encode(query);

      u8b.appendByte(PBYTE).append(ZERO32)
        .append(psU8name).appendByte(0)
        .append(u8query).appendByte(0)
        .appendByte(0).appendByte(0);

      return this;
    }

    bindNamed(name, paramCount, formatCodes=BINARY_CODES) {
      assert(typeof name === 'string' && name !== '' && typeof paramCount === 'number' && paramCount >= 0, E_BAD_ARGS);
      const pv = this[private$];
      assert(pv.state == 0, 'bindNamed may only be called on new portal');
      pv.setState(P_BIND_START);

      pv.paramCount = paramCount;
      pv.paramsAdded = 0;
      this.psName = name;
      const {u8b} = pv;

      this.psU8name = utf8Encode(name);

      return prepValues(this, formatCodes);
    }

    addParamOid(oid) {
      const pv = this[private$];

      if (pv.isState(P_PARSE_START, P_CLOSED)) {
        pv.u8b.writeInt32BE(oid);
      } else if (pv.isState(P_BIND_START, P_CLOSED)) {
        if (pv.isState(P_PARSED)) {
          pv.u8b.dataView.setInt32(pv.paramOidPos + (pv.paramsAdded) * 4, oid);
        }
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
      if (pv.isState(P_PARSE_START, P_CLOSED)) {
        pv.paramOidPos = u8b.length - (pv.paramsAdded * 4);
        u8b.grow(4 * (pv.paramCount - pv.paramsAdded));
        finishParse(this, pv);
      } else {
        assert((pv.state & (P_PARSED | P_BIND_START | P_BOUND)) == P_PARSED,
               'prepareValues may only be called on a parsed portal');
      }

      return prepValues(this, formatCodes);
    }

    addResultFormat(resultCodes=BINARY_CODES) {
      const pv = this[private$];
      assert(pv.isState(P_BIND_START, P_CLOSED), E_MISSING_PREPARE_VALUES);

      const {u8b} = pv;

      u8b.writeInt16BE(resultCodes.length);
      for (const code of resultCodes) u8b.writeInt16BE(code);

      finishBind(this, pv, true);
    }

    describeStatement(callback, sync = false) {
      const pv = this[private$];
      if (! pv.isState(P_PARSED | P_PARSE_START, P_CLOSED)) {
        assert(false, 'portal not in correct state to issue describe ' + pv.state);
      }

      pv.rowDescCallback = callback;

      finishParse(this, pv);

      const {u8name} = this;

      pv.describeState = pv.state;
      const {u8b} = pv;

      let pos = u8b.length;

      u8b.appendByte(DBYTE).writeInt32BE(u8name.length + 6);
      u8b.appendByte(SBYTE).append(u8name).appendByte(0);

      if (sync) {
        return new Promise((resolve) => lockPortal(this, () => {
          pv.u8b.append(SYNC);
          pv.send();
        }, resolve));
      }
    }

    describe(callback, sync = false) {
      if (this.error !== void 0) return;
      const pv = this[private$];
      assert(pv.isState(P_PARSED | P_BIND_START | P_BOUND, P_LOCKED | P_CLOSED | P_FETCHING),
             'portal not in correct state to issue describe');

      pv.rowDescCallback = callback;

      finishParse(this, pv);
      finishBind(this, pv);

      const {u8name} = this;

      pv.describeState = pv.state;
      const {u8b} = pv;

      let pos = u8b.length;

      u8b.appendByte(DBYTE).writeInt32BE(u8name.length + 6);
      u8b.appendByte(PBYTE).append(u8name).appendByte(0);

      if (sync) {
        return new Promise((resolve) => lockPortal(this, () => {
          pv.u8b.append(SYNC);
          pv.send();
        }, resolve));
      }
    }

    fetch(callback, maxRows=0) {
      assert(typeof maxRows === 'number' && typeof callback === 'function', E_BAD_ARGS);
      const pv = this[private$];
      assert(pv.canFetch, 'fetch not allowed here');

      finishParse(this, pv);
      finishBind(this, pv);

      assert(pv.isState(P_BOUND), E_MISSING_PREPARE_VALUES);

      return new Promise((resolve) => lockPortal(
        this, () => {
          pv.setState(P_FETCHING);
          pv.clearState(P_MORE);

          const {u8name} = this;
          const {u8b} = pv;

          let pos = u8b.length;

          u8b.appendByte(EBYTE).writeInt32BE(5 + u8name.length + 4);

          u8b.append(u8name).appendByte(0)
            .writeInt32BE(maxRows);

          pv.u8b.append(SYNC);

          pv.send();

          pv.nextRow = callback;
        }, resolve));
    }

    close(err) {
      const pv = this[private$];
      if (pv.isClosed) return this.error;
      this.error ??= err;
      return pv.closePortal();
    }

    commandComplete(callback) {this[private$].ccCallback = callback}
    get isExecuting() {return this[private$].isState(P_FETCHING)}
    get isMore() {return this[private$].isState(P_MORE)}
  }

  return PgPortal;
});
