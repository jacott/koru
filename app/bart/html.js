/**
 Load compiled template from .build directory.
 The template-compiler will convert the html to js.
 */
define({
  load: function (name, req, onload, config) {
    var idx = name.lastIndexOf('/');

    if (idx === -1) {
      name = '.build/' + name;
    } else {
      name = name.slice(0, ++idx) + '.build/' + name.slice(idx);
    }

    req([name+'.html.js'], function (value) {
      onload(value);
    });
  }
});
