define((require, exports, module) => {
  'use strict';
  const TH              = require('koru/test');

  const {stub, spy, util} = TH;

  const PgError = require('./pg-error');

  TH.testCase(module, ({before, after, beforeEach, afterEach, group, test}) => {
    test('defaults', () => {
      const err = new PgError({message: 'test err'});
      assert.equals(err.error, 500);
      assert.same(err.message, 'test err');
    });

    test('toString', () => {
      const err = new PgError({
        message: 'test error',
        severity: 'ERROR',
        code: '1234E',
        position: 12,
        hint: 'here is a hint',
      }, 'ab\ncde\nlonger line containing error\nsome extra stuff', ['p1', 2, 'p3']);
      assert.same(err.toString(), 'PgError(ERROR): test error (1234E)\n\nab\ncde\n' +
                  'longer line containing error\n----^\nsome extra stuff\n' +
                  "Hint: here is a hint\nParams: ['p1', 2, 'p3']");
    });
  });
});
