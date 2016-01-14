define(function(require, exports, module) {

  function loadAjax(url, callback) {
    var req = new XMLHttpRequest();

    req.addEventListener("load", function () {
      if (req.status == 200) { // found the file ok
        callback(null, req.responseText);
      } else {
        callback(Error(req.statusText));
      }
    });

    req.addEventListener("error", function () {
      callback(Error("Network Error"));
    });

    req.open('GET', url);
    req.send();
  }

  return loadAjax;
});
