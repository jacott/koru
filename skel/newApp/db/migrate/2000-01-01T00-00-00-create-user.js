define(() => (mig) => {
  mig.createTable({
    name: 'User',
    fields: {
      email: {type: 'text'},
      name: {type: 'text'},
    },
  });

  mig.createTable({
    name: 'UserLogin',
    fields: {
      userId: {type: 'id'},
      email: {type: 'text'},
      password: {type: 'jsonb'},
      tokens: {type: 'jsonb'},
      resetToken: {type: 'text'},
      resetTokenExpire: {type: 'bigint'},
    },

    indexes: [
      {columns: ['userId'], unique: true},
      {columns: ['email'], unique: true},
    ],
  });
});
