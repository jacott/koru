define((require, exports, module) => {
  'use strict';
  const SRP             = require('koru/crypto/srp');
  const Email           = require('koru/email');
  const koru            = require('koru/main');
  const Model           = require('koru/model/main');
  const Val             = require('koru/model/validation');
  const Random          = require('koru/random').global;
  const session         = require('koru/session');
  const util            = require('koru/util');

  const crypto = requirejs.nodeRequire('crypto');

  let emailConfig;

  const getToken = (data) => {
    data = data.toString();
    if (data.match(/^[\d\w]+\|[\d\w]+$/)) {
      return data.split('|');
    }
    return [];
  };

  class UserLogin extends Model.BaseModel {
    unexpiredTokens() {
      const tokens = this.tokens;
      const now = util.dateNow();
      const keyVal = [];
      for (let key in tokens) {
        const time = tokens[key];
        if (time > now) {
          keyVal.push(time + '|' + key);
        }
      }
      keyVal.sort();
      const max = Math.min(10, keyVal.length);

      const result = {};
      for (let i = 1; i <= max; ++i) {
        const pair = keyVal[keyVal.length - i].split('|');
        result[pair[1]] = + pair[0];
      }

      return result;
    }

    makeToken() {
      const token = Random.id();
      const tokens = this.unexpiredTokens();
      tokens[token] = util.dateNow() + 180*24*1000*60*60;
      this.tokens = tokens;
      return token;
    }
  }

  UserLogin.define({
    module,
    name: 'UserLogin',
    fields: {
      userId: 'text',
      email: 'text',
      password: 'object',
      tokens: 'object',
      resetToken: 'text',
      resetTokenExpire: 'bigint',
    },
  });

  const configureEmail = () => {
    emailConfig = koru.config.userAccount && koru.config.userAccount.emailConfig || {};

    if (! emailConfig.from) koru.throwConfigMissing('userAccount.emailConfig.from');
    if (! emailConfig.siteName) koru.throwConfigMissing('userAccount.emailConfig.siteName');
    if (! emailConfig.sendResetPasswordEmailText) {
      koru.throwConfigMissing('userAccount.emailConfig.sendResetPasswordEmailText');
    }
    if (typeof emailConfig.sendResetPasswordEmailText !== 'function') {
      koru.throwConfigError('userAccount.sendResetPasswordEmailText',
                            'must be of type function(userId, resetToken)');
    }
  };

  const makeScrypt = async (password, salt=crypto.randomBytes(16)) => {
    const scrypt = await new Promise((resolve, reject) => {
      crypto.scrypt(
        password, salt, 64,
        undefined, (err, key) => {
          if (err) {
            reject(err);
          } else {
            resolve(key);
          }
        });
    });

    const key = (await scrypt).toString('hex');
    return {type: 'scrypt', salt: salt.toString('hex'), key};
  };

  let running = false;

  const stop = () => {
    emailConfig = undefined;
    if (! running) return;
    running = false;
    session.unprovide('V');
  };

  const changePassword = async (email, oldPassword, newPassword) => {
    const doc = await UserLogin.findBy('email', email);
    await assertScryptPassword(doc, oldPassword);

    await doc.$update('password', await makeScrypt(newPassword));
  };

  const UserAccount = {
    start() {
      if (running) return;
      running = true;
      session.provide('V', onMessage);
    },

    stop,

    UserLogin,
    /**
     * @deprecated
     **/
    model: UserLogin,

    makeScryptPassword: makeScrypt,
    changePassword,

    async resetPassword(token, password) {
      Val.ensureString(token);
      const parts = token.split('-');
      const lu = await UserLogin.findById(parts[0]);
      if (lu !== undefined) {
        if (lu.password !== undefined && lu.password.type === 'scrypt') {
          password = await makeScrypt(password);
        } else {
          Val.assertCheck(password, VERIFIER_SPEC);
        }

        if (lu.resetToken === parts[1] && util.dateNow() < lu.resetTokenExpire) {
          lu.password = password;
          lu.resetToken = lu.resetTokenExpire = undefined;
          const loginToken = lu.makeToken();
          await lu.$$save();
          return [lu, loginToken];
        }
      }
      throw new koru.Error(404, 'Expired or invalid reset request');
    },

    async checkScryptPassword(email, password) {
      const doc = await UserLogin.findBy('email', email);
      await assertScryptPassword(doc, password);
      return doc;
    },

    async verifyClearPassword(email, password) {
      const doc = await UserLogin.findBy('email', email);
      if (doc === undefined || doc.password === undefined) return;

      if (doc.password.type === 'scrypt') {
        try {
          await assertScryptPassword(doc, password);
        } catch (err) {
          if (err.error == 403) {
            return;
          }
          throw err;
        }
      } else {
        const C = new SRP.Client(password);
        const S = new SRP.Server(doc.password);

        const request = C.startExchange();
        const challenge = S.issueChallenge(request);
        const response = C.respondToChallenge(challenge);

        if (S.M !== response.M) {
          return;
        }
      }
      const token = doc.makeToken();
      await doc.$$save();
      return [doc, token];
    },

    async verifyToken(emailOrId, token) {
      const doc = emailOrId.indexOf('@') === -1
            ? await UserLogin.findById(emailOrId)
            : await UserLogin.findBy('email', emailOrId);
      if (doc !== undefined && doc.unexpiredTokens()[token] !== undefined) {
        return doc;
      }
    },

    async createUserLogin(attrs) {
      let password;
      if (attrs.scrypt) {
        password = await makeScrypt(attrs.password);
      } else {
        password = attrs.password && SRP.generateVerifier(attrs.password);
      }

      return await UserLogin.create({
        email: attrs.email,
        userId: attrs.userId,
        tokens: {},
        password,
      });
    },

    async makeResetPasswordKey(user) {
      const lu = await UserLogin.findBy('userId', user._id);

      lu.resetToken = Random.id() + Random.id();
      lu.resetTokenExpire = util.dateNow() + 24*60*60*1000;
      await lu.$$save();

      return lu;
    },

    async sendResetPasswordEmail(user) {
      emailConfig || configureEmail();

      const lu = await this.makeResetPasswordKey(user);

      Email.send({
        from: emailConfig.from,
        to: lu.email,
        subject: 'How to reset your password on ' + emailConfig.siteName,
        text: emailConfig.sendResetPasswordEmailText(user, lu._id + '-' + lu.resetToken),
        html: emailConfig.sendResetPasswordEmailHtml?.(user, lu._id + '-' + lu.resetToken),
      });
    },

    async updateOrCreateUserLogin(attrs) {
      const lu = await UserLogin.findBy('userId', attrs.userId);
      if (! lu) return UserLogin.create({
        email: attrs.email,
        userId: attrs.userId,
        tokens: {},
        password: attrs.password,
      });

      const update = {};

      if (attrs.email) update.email = attrs.email;
      if (attrs.password) update.password = attrs.password;
      util.isObjEmpty(update) || await lu.$update(update);
      return lu;
    },

    assertResponse(conn, response) {
      if (response && conn.$srp && response.M === conn.$srp.M) return;
      throw new koru.Error(403, 'incorrect_password');
    },

    SRPBegin(state, request) {
      return SRPBegin.call(state, request);
    },
    SRPLogin(state, response) {
      return SRPLogin.call(state, response);
    },

    async logout(_id, token) {
      await UserLogin.onId(_id).update({$partial: {tokens: [token, null]}});
    },

    async logoutOtherClients(_id, token) {
      const lu = await UserLogin.findById(_id);
      if (lu !== undefined) {
        const mod = {};
        if (lu.tokens[token] !== undefined) {
          mod[token] = lu.tokens[token];
          await UserLogin.where({_id: lu._id}).update('tokens', mod);
          return lu;
        }
      }
    },
  };

  const assertScryptPassword = async (doc, password) => {
    if (doc === undefined || doc.password == null ||
        doc.password.type !== 'scrypt') {
      throw new koru.Error(403, 'failure');
    }

    if ((await makeScrypt(password, Buffer.from(doc.password.salt, 'hex'))).key !== doc.password.key) {
      throw new koru.Error(403, 'incorrect_password');
    }
  };

  session.defineRpc('UserAccount.changePassword', changePassword);

  session.defineRpc('UserAccount.loginWithPassword', loginWithPassword);

  async function loginWithPassword(email, password) {
    const doc = await UserLogin.findBy('email', email);
    await assertScryptPassword(doc, password);

    const token = doc.makeToken();
    await doc.$$save();

    await this.setUserId(doc.userId);

    return {
      userId: doc.userId,
      loginToken: doc._id + '|' + token,
    };
  }

  session.defineRpc('UserAccount.secureCall', secureCall);

  async function secureCall(method, email, password, args) {
    const doc = await UserLogin.findBy('email', email);
    await assertScryptPassword(doc, password);

    try {
      this.secure = doc;
      return this._session.rpc(method, ...args);
    } finally {
      this.secure = undefined;
    }
  }

  session.defineRpc('SRPBegin', SRPBegin);

  async function SRPBegin(request) {
    const doc = await UserLogin.findBy('email', request.email);
    if (doc === undefined || doc.password == null) throw new koru.Error(403, 'failure');
    const srp = new SRP.Server(doc.password);
    this.$srp = srp;
    this.$srpUserAccount = doc;
    return srp.issueChallenge({A: request.A});
  }

  session.defineRpc('SRPLogin', SRPLogin);

  async function SRPLogin(response) {
    UserAccount.assertResponse(this, response);
    const doc = this.$srpUserAccount;
    const token = doc.makeToken();
    await doc.$$save();
    if (typeof this.setUserId === 'function') {
      await this.setUserId(doc.userId);
    } else {
      this.userId = doc.userId;
    }
    const result = {
      HAMK: this.$srp && this.$srp.HAMK,
      userId: doc.userId,
      loginToken: doc._id + '|' + token,
    };
    this.$srp = null;
    this.$srpUserAccount = null;
    return result;
  }

  const VERIFIER_SPEC = UserAccount.VERIFIER_SPEC = {
    identity: 'string', salt: 'string', verifier: 'string'};

  session.defineRpc('SRPChangePassword', async function (response) {
    UserAccount.assertResponse(this, response);

    Val.assertCheck(response.newPassword, VERIFIER_SPEC);

    if (UserAccount.interceptChangePassword !== undefined) {
      await UserAccount.interceptChangePassword(this.$srpUserAccount, response.newPassword);
    } else {
      await this.$srpUserAccount.$update({password: response.newPassword});
    }

    const result = {
      HAMK: this.$srp && this.$srp.HAMK,
    };
    this.$srp = null;
    this.$srpUserAccount = null;
    return result;
  });

  session.defineRpc('resetPassword', async function (token, passwordHash) {
    const result = await UserAccount.resetPassword(token, passwordHash);
    const lu = result[0];
    this.send('VT', lu._id + '|' + result[1]);
    this.setUserId(lu.userId);
    this.loginToken = result[1];
  });

  session.defineRpc('logoutOtherClients', async function (data) {
    if (this.userId === this._session.DEFAULT_USER_ID) return;
    const [_id, token] = getToken(data);
    if (token !== undefined && await UserAccount.logoutOtherClients(_id, token)) {
      const conns = session.conns;
      for (let sessId in conns) {
        if (sessId === this.sessId) continue;
        const curr = conns[sessId];

        if (curr.userId === this.userId) {
          curr.setUserId(undefined);
        }
      }
    }
  });

  async function onMessage(data) {
    const conn = this;
    const cmd = data[0];
    let token;
    switch (cmd) {
    case 'L': {
      const [_id, token] = getToken(data.slice(1));
      const lu = _id && await UserLogin.findById(_id);

      if (lu && lu.unexpiredTokens()[token]) {
        conn.setUserId(lu.userId); // will send a VS + VC. See server-connection
        conn.loginToken = token;
      } else {
        conn.send('VF');
      }
    } break;
    case 'X': { // logout me
      const [_id, token] = getToken(data.slice(1));
      token && await UserAccount.logout(_id, token);
      await conn.setUserId(undefined); // will send a VS + VC. See server-connection
    } break;
    }
  }

  module.onUnload(stop);

  return UserAccount;
});
