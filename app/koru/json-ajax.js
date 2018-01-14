define(function(require, exports, module) {
  const koru = require('koru');

  const request = (method, url, body, user, password, callback)=>{
    if (typeof user === 'function') {
      callback = user;
      user = password = undefined;
    }
    const req = new XMLHttpRequest();

    req.addEventListener("load", function () {
      if (! callback) return;
      if (Math.floor(req.status/100) === 2) {
        try {
          callback(null, req.responseText ? JSON.parse(req.responseText) : null);
        } catch (ex) {
          callback(ex);
        }
      }
      else {
        callback(new koru.Error(req.status, req.responseText));
      }

    });

    req.addEventListener("error", function () {
      callback && callback(Error("Network Error"));
    });

    req.open(method, url, true);
    if (user !== undefined)
      req.setRequestHeader("Authorization", `Basic ${window.btoa(`${user}:${password}`)}`);
    req.setRequestHeader("Content-Type", "application/json;charset=UTF-8");
    body ? req.send(JSON.stringify(body)) : req.send();
  };

  return {
    request,

    get: (url, user, password, callback)=> request("GET", url, undefined, user, password, callback),
    post: (url, body, user, password, callback)=>request("POST", url, body, user, password, callback),
  };
});
