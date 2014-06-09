define(function(require, exports, module) {
  exports.compress = function (uncompressed) {
    // Build the dictionary.
    var i,
        dictionary = {},
        c,
        wc,
        w = "",
        result = [],
        dictSize = 256;
    for (i = 0; i < 256; i += 1) {
      dictionary[String.fromCharCode(i)] = i;
    }

    for (i = 0; i < uncompressed.length; i += 1) {
      c = String.fromCharCode(uncompressed[i]);
      wc = w + c;
      //Do not use dictionary[wc] because javascript arrays
      //will return values for array['pop'], array['push'] etc
      // if (dictionary[wc]) {
      if (dictionary.hasOwnProperty(wc)) {
        w = wc;
      } else {
        result.push(dictionary[w]);
        // Add wc to the dictionary.
        dictionary[wc] = dictSize++;
        w = String(c);
      }
    }

    // Output the code for w.
    if (w !== "") {
      result.push(dictionary[w]);
    }
    return result;
  };

  var pushFunc = Array.prototype.push;

  exports.decompress = function (compressed) {
    // Build the dictionary.
    var i,
        dictionary = [],
        w,
        result,
        k,
        entry = [],
        dictSize = 256;
    for (i = 0; i < 256; i += 1) {
      dictionary[i] = [i];
    }

    w = compressed.slice(0,1);
    result = w.slice(0);
    for (i = 1; i < compressed.length; i += 1) {
      k = compressed[i];
      if (dictionary[k]) {
        entry = dictionary[k].slice(0);
      } else {
        if (k === dictSize) {
          entry = w.slice(0);
          w.length && entry.push(w[0]);
        } else {
          return null;
        }
      }

      if (entry.length) {
        pushFunc.apply(result, entry);
        w.push(entry[0]);
      }

      // Add w+entry[0] to the dictionary.
      dictionary[dictSize++] = w;

      w = entry;
    }
    return result;
  };
});
