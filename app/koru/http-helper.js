define((require) => {
  'use strict';
  const koru            = require('koru');
  const util            = require('koru/util');
  const Readable        = requirejs.nodeRequire('stream').Readable;
  const nodeUtil        = requirejs.nodeRequire('util');

  const {inspect$} = require('koru/symbols');

  class RequestStub extends Readable {
    constructor(extend, input='') {
      super({});
      util.merge(this, extend);
      this._setBody(input);
    }

    _setBody(input='') {
      this._input = Buffer.isBuffer(input) || typeof input === 'string'
        ? input
        : JSON.stringify(input);
      this.headers = this.headers || {};
      this.headers['content-length'] = this._input.length;
    }

    _read() {
      if (this._input === '') {
        this.push(null);
      } else {
        const buf = Buffer.from(this._input, 'utf8');
        this._input = '';
        this.push(buf);
      }
    }

    [inspect$]() {
      return `request.url("${this.url}")`;
    }
  }

  return {
    RequestStub,

    makeResponse(v) {
      v.output = [];
      return {
        writeHead: koru._TEST_.test.stub(),
        write: (data) => {
          refute(v.ended);
          v.output.push(data);
        },
        end: (data) => {
          v.output.push(data);
          v.ended = true;
        },
      };
    },
  };
});
