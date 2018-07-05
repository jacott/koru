define((require, exports, module)=>{
  const koru = require('koru');

  const request = (method, url, body, user, password, callback)=>{
    if (typeof user === 'function') {
      callback = user;
      user = password = undefined;
    }
    const req = new XMLHttpRequest();

    req.addEventListener("load", ()=>{
      if (! callback) return;
      if (Math.floor(req.status/100) === 2) {
        let resp = null;
        try {
          if (req.responseText)
            resp = JSON.parse(req.responseText);
        } catch (ex) {
          callback(ex);
          return;
        }
        callback(null, resp);
      }
      else {
        callback(new koru.Error(req.status, req.responseText));
      }

    });

    req.addEventListener("error", ()=>{
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
