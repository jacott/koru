define(function(require, exports, module) {
  const koru     = require('koru');
  const util     = require('koru/util');

  const {inspect$} = require('koru/symbols');

  const Readable = requirejs.nodeRequire('stream').Readable;
  const nodeUtil = requirejs.nodeRequire('util');

  class RequestStub extends Readable {
    constructor(extend, input='') {
      super({});
      util.merge(this, extend);
      this._setBody(input);
    }

    _setBody(input='') {
      this._input = typeof input === 'string' ? input : JSON.stringify(input);
      this.headers = this.headers || {};
      this.headers['content-length'] = this._input.length;
    }

    _read() {
      if (! this._input)
        this.push(null);
      else {
        var buf = new Buffer(this._input, 'utf8');
        this._input = null;
        this.push(buf);
      }
    }

    [inspect$]() {
      return `<request url=${this.url}>`;
    }
  };

  return {
    RequestStub,

    makeResponse(v) {
      v.output = [];
      return {
        writeHead: koru._geddon_.test.stub(),
        write(data) {
          refute(v.ended);
          v.output.push(data);
        },
        end(data) {
          v.output.push(data);
          v.ended = true;
        }
      };
    }
  };
});
