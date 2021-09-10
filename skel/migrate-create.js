define((require) => (mig) => {
  'use strict';
  mig.createTable({
    name: $$tableName$$,
    fields: [
      $$addColumns$$,
    ],
  });
});
