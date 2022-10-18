const NO_CLIENT_ASYNC = Buffer.from('//;no-client-async');
const CLIENT_ASYNC = NO_CLIENT_ASYNC.subarray(6);
const SYNC = Buffer.from('sync ');
const WAIT = Buffer.from('wait ');

const MLC_END = Buffer.from('*/');

const SPECIAL = [];
SPECIAL[39] = 1;
SPECIAL[34] = 1;
SPECIAL[96] = 1;
SPECIAL[91] = 2;
SPECIAL[92] = 3;
SPECIAL[93] = 2;

for (let i = 58; i < 65; ++i) SPECIAL[i] = 3;
for (let i = 123; i < 128; ++i) SPECIAL[i] = 3;

const search = (data, ia) => {
  const len = data.length - 5;
  let spc, char = 0;
  for (let i = ia[0]; i < len; ++i) {
    char = data[i];
    if (char === 97) { // a
      const word = data.subarray(i + 1, i + 6);
      if (word.equals(WAIT) || word.equals(SYNC)) {
        data.fill(32, i, i += 5);
      }
    } else if (char === 47) { // /
      const nc = data[i + 1];
      if (nc === 47) { // /
        if (data[i + 2] === 59 && CLIENT_ASYNC.equals(data.subarray(i + 3, i + 3 + CLIENT_ASYNC.length))) {
          i = data.indexOf(10, i + 3 + CLIENT_ASYNC.length);
          if (i == -1) return;
          ia[0] = i + 1;
          return searchForNoAsync;
        }
        ia[0] = i + 2;
        return singleLineComment;
      } else if (nc === 42) { // *
        ia[0] = i + 2;
        return multiLineComment;
      }
    } else {
      while ((spc = SPECIAL[char]) === undefined && (char > 47 || char === 36)) {
        if (i >= len) return;
        char = data[++i];
      }

      if (spc === 1) {
        ia[0] = i + 1;
        ia[1] = char;
        return skipString;
      }
    }
  }
};

const searchForNoAsync = (data, ia) => {
  const len = data.length - 5;
  let char = 0;
  for (let i = ia[0]; i < len; ++i) {
    char = data[i];
    if (char === 47) { // /
      const nc = data[i + 1];
      if (nc === 47) { // /
        if (data[i + 2] === 59 && NO_CLIENT_ASYNC.equals(data.subarray(i, i + NO_CLIENT_ASYNC.length))) {
          i = data.indexOf(10, i + NO_CLIENT_ASYNC.length);
          if (i == -1) return;
          ia[0] = i + 1;
          return search;
        }
        ia[0] = i + 2;
        if (singleLineComment(data, ia) === undefined) return;
        i = ia[0] - 1;
      } else if (nc === 42) { // *
        ia[0] = i + 2;
        if (multiLineComment(data, ia) === undefined) return;
        i = ia[0] - 1;
      } else if (SPECIAL[char] === 1) {
        ia[0] = i + 1;
        ia[1] = char;
        if (skipString(data, ia) === undefined) return;
      }
    }
  }
};

const unescapedIndexOf = (data, wanted, i) => {
  const len = data.length;
  for (;i < len; ++i) {
    const char = data[i];
    if (char === 92) {
      ++i;
    } else if (char === wanted) {
      return i;
    }
  }
  return -1;
};

const skipString = (data, ia) => {
  let i = unescapedIndexOf(data, ia[1], ia[0]);
  if (i == -1) return;
  ia[0] = i + 1;
  return search;
};

const singleLineComment = (data, ia) => {
  const i = data.indexOf(10, ia[0]);
  if (i == -1) return;
  ia[0] = i + 1;
  return search;
};

const multiLineComment = (data, ia) => {
  const i = data.indexOf(MLC_END, ia[0]);
  if (i == -1) {
    ia[0] = data.length;
    return;
  } else {
    ia[0] = i + 1;
    return search;
  }
};




exports.convert = data => {
  if (NO_CLIENT_ASYNC.equals(data.subarray(0, NO_CLIENT_ASYNC.length))) {
    const ia = [NO_CLIENT_ASYNC.length, 0];
    let mode = singleLineComment;
    while (mode !== undefined) {
      mode = mode(data, ia);
    }
  }
}

exports.isCandidateFilename = (pathname) => pathname.endsWith('.js') &&
  ! pathname.endsWith('-server.js') && ! pathname.endsWith('-client.js');
