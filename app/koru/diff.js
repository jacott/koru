/**
 * Diff Match and Patch
 *
 * Copyright 2006 Google Inc.
 * http://code.google.com/p/google-diff-match-patch/
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * This is just the diff part. See the original at:
 *
 *   http://code.google.com/p/google-diff-match-patch/
 *
 * Modified by: Geoff Jacobsen <geoffjacobsen@gmail.com>
 * Date modified: 10-Jul-2017
 */

define((require, exports, module)=>{
  const util = require('koru/util');
  const {hasOwn} = util;

  const DIFF_DELETE = -1;
  const DIFF_INSERT = 1;
  const DIFF_EQUAL = 0;
  function Diff() {
    this.Diff_Timeout = 1.0;
    this.Diff_EditCost = 4;
  }
  Diff.prototype.diff_main = function(text1, text2, opt_checklines,
                                      opt_deadline) {
    if (typeof opt_deadline == 'undefined') {
      if (this.Diff_Timeout <= 0) {
        opt_deadline = Number.MAX_VALUE;
      } else {
        opt_deadline = (new Date).getTime() + this.Diff_Timeout * 1000;
      }
    }
    var deadline = opt_deadline;
    if (text1 == null || text2 == null) {
      throw new Error('Null input. (diff_main)');
    }
    if (text1 == text2) {
      if (text1) {
        return [[DIFF_EQUAL, text1]];
      }
      return [];
    }
    if (typeof opt_checklines == 'undefined') {
      opt_checklines = true;
    }
    var checklines = opt_checklines;
    var commonlength = this.diff_commonPrefix(text1, text2);
    var commonprefix = text1.substring(0, commonlength);
    text1 = text1.substring(commonlength);
    text2 = text2.substring(commonlength);
    commonlength = this.diff_commonSuffix(text1, text2);
    var commonsuffix = text1.substring(text1.length - commonlength);
    text1 = text1.substring(0, text1.length - commonlength);
    text2 = text2.substring(0, text2.length - commonlength);
    var diffs = this.diff_compute_(text1, text2, checklines, deadline);
    if (commonprefix) {
      diffs.unshift([DIFF_EQUAL, commonprefix]);
    }
    if (commonsuffix) {
      diffs.push([DIFF_EQUAL, commonsuffix]);
    }
    this.diff_cleanupMerge(diffs);
    return diffs;
  };
  Diff.prototype.diff_compute_ = function(text1, text2, checklines,
                                          deadline) {
    var diffs;
    if (!text1) {
      return [[DIFF_INSERT, text2]];
    }
    if (!text2) {
      return [[DIFF_DELETE, text1]];
    }
    var longtext = text1.length > text2.length ? text1 : text2;
    var shorttext = text1.length > text2.length ? text2 : text1;
    var i = longtext.indexOf(shorttext);
    if (i != -1) {
      diffs = [[DIFF_INSERT, longtext.substring(0, i)],
               [DIFF_EQUAL, shorttext],
               [DIFF_INSERT, longtext.substring(i + shorttext.length)]];
      if (text1.length > text2.length) {
        diffs[0][0] = diffs[2][0] = DIFF_DELETE;
      }
      return diffs;
    }
    if (shorttext.length == 1) {
      return [[DIFF_DELETE, text1], [DIFF_INSERT, text2]];
    }
    var hm = this.diff_halfMatch_(text1, text2);
    if (hm) {
      var text1_a = hm[0];
      var text1_b = hm[1];
      var text2_a = hm[2];
      var text2_b = hm[3];
      var mid_common = hm[4];
      var diffs_a = this.diff_main(text1_a, text2_a, checklines, deadline);
      var diffs_b = this.diff_main(text1_b, text2_b, checklines, deadline);
      return diffs_a.concat([[DIFF_EQUAL, mid_common]], diffs_b);
    }
    if (checklines && text1.length > 100 && text2.length > 100) {
      return this.diff_lineMode_(text1, text2, deadline);
    }
    return this.diff_bisect_(text1, text2, deadline);
  };
  Diff.prototype.diff_lineMode_ = function(text1, text2, deadline) {
    var a = this.diff_linesToChars_(text1, text2);
    text1 = a.chars1;
    text2 = a.chars2;
    var linearray = a.lineArray;
    var diffs = this.diff_main(text1, text2, false, deadline);
    this.diff_charsToLines_(diffs, linearray);
    this.diff_cleanupSemantic(diffs);
    diffs.push([DIFF_EQUAL, '']);
    var pointer = 0;
    var count_delete = 0;
    var count_insert = 0;
    var text_delete = '';
    var text_insert = '';
    while (pointer < diffs.length) {
      switch (diffs[pointer][0]) {
      case DIFF_INSERT:
        count_insert++;
        text_insert += diffs[pointer][1];
        break;
      case DIFF_DELETE:
        count_delete++;
        text_delete += diffs[pointer][1];
        break;
      case DIFF_EQUAL:
        if (count_delete >= 1 && count_insert >= 1) {
          diffs.splice(pointer - count_delete - count_insert,
                       count_delete + count_insert);
          pointer = pointer - count_delete - count_insert;
          var a = this.diff_main(text_delete, text_insert, false, deadline);
          for (var j = a.length - 1; j >= 0; j--) {
            diffs.splice(pointer, 0, a[j]);
          }
          pointer = pointer + a.length;
        }
        count_insert = 0;
        count_delete = 0;
        text_delete = '';
        text_insert = '';
        break;
      }
      pointer++;
    }
    diffs.pop();  // Remove the dummy entry at the end.
    return diffs;
  };
  Diff.prototype.diff_bisect_ = function(text1, text2, deadline) {
    var text1_length = text1.length;
    var text2_length = text2.length;
    var max_d = Math.ceil((text1_length + text2_length) / 2);
    var v_offset = max_d;
    var v_length = 2 * max_d;
    var v1 = new Array(v_length);
    var v2 = new Array(v_length);
    for (var x = 0; x < v_length; x++) {
      v1[x] = -1;
      v2[x] = -1;
    }
    v1[v_offset + 1] = 0;
    v2[v_offset + 1] = 0;
    var delta = text1_length - text2_length;
    var front = (delta % 2 != 0);
    var k1start = 0;
    var k1end = 0;
    var k2start = 0;
    var k2end = 0;
    for (var d = 0; d < max_d; d++) {
      if ((new Date()).getTime() > deadline) {
        break;
      }
      for (var k1 = -d + k1start; k1 <= d - k1end; k1 += 2) {
        var k1_offset = v_offset + k1;
        var x1;
        if (k1 == -d || (k1 != d && v1[k1_offset - 1] < v1[k1_offset + 1])) {
          x1 = v1[k1_offset + 1];
        } else {
          x1 = v1[k1_offset - 1] + 1;
        }
        var y1 = x1 - k1;
        while (x1 < text1_length && y1 < text2_length &&
               text1.charAt(x1) == text2.charAt(y1)) {
          x1++;
          y1++;
        }
        v1[k1_offset] = x1;
        if (x1 > text1_length) {
          k1end += 2;
        } else if (y1 > text2_length) {
          k1start += 2;
        } else if (front) {
          var k2_offset = v_offset + delta - k1;
          if (k2_offset >= 0 && k2_offset < v_length && v2[k2_offset] != -1) {
            var x2 = text1_length - v2[k2_offset];
            if (x1 >= x2) {
              return this.diff_bisectSplit_(text1, text2, x1, y1, deadline);
            }
          }
        }
      }
      for (var k2 = -d + k2start; k2 <= d - k2end; k2 += 2) {
        var k2_offset = v_offset + k2;
        var x2;
        if (k2 == -d || (k2 != d && v2[k2_offset - 1] < v2[k2_offset + 1])) {
          x2 = v2[k2_offset + 1];
        } else {
          x2 = v2[k2_offset - 1] + 1;
        }
        var y2 = x2 - k2;
        while (x2 < text1_length && y2 < text2_length &&
               text1.charAt(text1_length - x2 - 1) ==
               text2.charAt(text2_length - y2 - 1)) {
          x2++;
          y2++;
        }
        v2[k2_offset] = x2;
        if (x2 > text1_length) {
          k2end += 2;
        } else if (y2 > text2_length) {
          k2start += 2;
        } else if (!front) {
          var k1_offset = v_offset + delta - k2;
          if (k1_offset >= 0 && k1_offset < v_length && v1[k1_offset] != -1) {
            var x1 = v1[k1_offset];
            var y1 = v_offset + x1 - k1_offset;
            x2 = text1_length - x2;
            if (x1 >= x2) {
              return this.diff_bisectSplit_(text1, text2, x1, y1, deadline);
            }
          }
        }
      }
    }
    return [[DIFF_DELETE, text1], [DIFF_INSERT, text2]];
  };
  Diff.prototype.diff_bisectSplit_ = function(text1, text2, x, y,
                                              deadline) {
    var text1a = text1.substring(0, x);
    var text2a = text2.substring(0, y);
    var text1b = text1.substring(x);
    var text2b = text2.substring(y);
    var diffs = this.diff_main(text1a, text2a, false, deadline);
    var diffsb = this.diff_main(text1b, text2b, false, deadline);
    return diffs.concat(diffsb);
  };
  Diff.prototype.diff_linesToChars_ = function(text1, text2) {
    var lineArray = [];  // e.g. lineArray[4] == 'Hello\n'
    var lineHash = {};   // e.g. lineHash['Hello\n'] == 4
    lineArray[0] = '';
    function diff_linesToCharsMunge_(text) {
      var chars = '';
      var lineStart = 0;
      var lineEnd = -1;
      var lineArrayLength = lineArray.length;
      while (lineEnd < text.length - 1) {
        lineEnd = text.indexOf('\n', lineStart);
        if (lineEnd == -1) {
          lineEnd = text.length - 1;
        }
        var line = text.substring(lineStart, lineEnd + 1);
        lineStart = lineEnd + 1;
        if (hasOwn(lineHash, line)) {
          chars += String.fromCharCode(lineHash[line]);
        } else {
          chars += String.fromCharCode(lineArrayLength);
          lineHash[line] = lineArrayLength;
          lineArray[lineArrayLength++] = line;
        }
      }
      return chars;
    }
    var chars1 = diff_linesToCharsMunge_(text1);
    var chars2 = diff_linesToCharsMunge_(text2);
    return {chars1: chars1, chars2: chars2, lineArray: lineArray};
  };
  Diff.prototype.diff_charsToLines_ = function(diffs, lineArray) {
    for (var x = 0; x < diffs.length; x++) {
      var chars = diffs[x][1];
      var text = [];
      for (var y = 0; y < chars.length; y++) {
        text[y] = lineArray[chars.charCodeAt(y)];
      }
      diffs[x][1] = text.join('');
    }
  };
  Diff.prototype.diff_commonPrefix = function(text1, text2) {
    if (!text1 || !text2 || text1.charAt(0) != text2.charAt(0)) {
      return 0;
    }
    var pointermin = 0;
    var pointermax = Math.min(text1.length, text2.length);
    var pointermid = pointermax;
    var pointerstart = 0;
    while (pointermin < pointermid) {
      if (text1.substring(pointerstart, pointermid) ==
          text2.substring(pointerstart, pointermid)) {
        pointermin = pointermid;
        pointerstart = pointermin;
      } else {
        pointermax = pointermid;
      }
      pointermid = Math.floor((pointermax - pointermin) / 2 + pointermin);
    }
    return pointermid;
  };
  Diff.prototype.diff_commonSuffix = function(text1, text2) {
    if (!text1 || !text2 ||
        text1.charAt(text1.length - 1) != text2.charAt(text2.length - 1)) {
      return 0;
    }
    var pointermin = 0;
    var pointermax = Math.min(text1.length, text2.length);
    var pointermid = pointermax;
    var pointerend = 0;
    while (pointermin < pointermid) {
      if (text1.substring(text1.length - pointermid, text1.length - pointerend) ==
          text2.substring(text2.length - pointermid, text2.length - pointerend)) {
        pointermin = pointermid;
        pointerend = pointermin;
      } else {
        pointermax = pointermid;
      }
      pointermid = Math.floor((pointermax - pointermin) / 2 + pointermin);
    }
    return pointermid;
  };
  Diff.prototype.diff_commonOverlap_ = function(text1, text2) {
    var text1_length = text1.length;
    var text2_length = text2.length;
    if (text1_length == 0 || text2_length == 0) {
      return 0;
    }
    if (text1_length > text2_length) {
      text1 = text1.substring(text1_length - text2_length);
    } else if (text1_length < text2_length) {
      text2 = text2.substring(0, text1_length);
    }
    var text_length = Math.min(text1_length, text2_length);
    if (text1 == text2) {
      return text_length;
    }
    var best = 0;
    var length = 1;
    while (true) {
      var pattern = text1.substring(text_length - length);
      var found = text2.indexOf(pattern);
      if (found == -1) {
        return best;
      }
      length += found;
      if (found == 0 || text1.substring(text_length - length) ==
          text2.substring(0, length)) {
        best = length;
        length++;
      }
    }
  };
  Diff.prototype.diff_halfMatch_ = function(text1, text2) {
    if (this.Diff_Timeout <= 0) {
      return null;
    }
    var longtext = text1.length > text2.length ? text1 : text2;
    var shorttext = text1.length > text2.length ? text2 : text1;
    if (longtext.length < 4 || shorttext.length * 2 < longtext.length) {
      return null;  // Pointless.
    }
    var dmp = this;  // 'this' becomes 'window' in a closure.
    function diff_halfMatchI_(longtext, shorttext, i) {
      var seed = longtext.substring(i, i + Math.floor(longtext.length / 4));
      var j = -1;
      var best_common = '';
      var best_longtext_a, best_longtext_b, best_shorttext_a, best_shorttext_b;
      while ((j = shorttext.indexOf(seed, j + 1)) != -1) {
        var prefixLength = dmp.diff_commonPrefix(longtext.substring(i),
                                                 shorttext.substring(j));
        var suffixLength = dmp.diff_commonSuffix(longtext.substring(0, i),
                                                 shorttext.substring(0, j));
        if (best_common.length < suffixLength + prefixLength) {
          best_common = shorttext.substring(j - suffixLength, j) +
            shorttext.substring(j, j + prefixLength);
          best_longtext_a = longtext.substring(0, i - suffixLength);
          best_longtext_b = longtext.substring(i + prefixLength);
          best_shorttext_a = shorttext.substring(0, j - suffixLength);
          best_shorttext_b = shorttext.substring(j + prefixLength);
        }
      }
      if (best_common.length * 2 >= longtext.length) {
        return [best_longtext_a, best_longtext_b,
                best_shorttext_a, best_shorttext_b, best_common];
      } else {
        return null;
      }
    }
    var hm1 = diff_halfMatchI_(longtext, shorttext,
                               Math.ceil(longtext.length / 4));
    var hm2 = diff_halfMatchI_(longtext, shorttext,
                               Math.ceil(longtext.length / 2));
    var hm;
    if (!hm1 && !hm2) {
      return null;
    } else if (!hm2) {
      hm = hm1;
    } else if (!hm1) {
      hm = hm2;
    } else {
      hm = hm1[4].length > hm2[4].length ? hm1 : hm2;
    }
    var text1_a, text1_b, text2_a, text2_b;
    if (text1.length > text2.length) {
      text1_a = hm[0];
      text1_b = hm[1];
      text2_a = hm[2];
      text2_b = hm[3];
    } else {
      text2_a = hm[0];
      text2_b = hm[1];
      text1_a = hm[2];
      text1_b = hm[3];
    }
    var mid_common = hm[4];
    return [text1_a, text1_b, text2_a, text2_b, mid_common];
  };
  Diff.prototype.diff_cleanupSemantic = function(diffs) {
    var changes = false;
    var equalities = [];  // Stack of indices where equalities are found.
    var equalitiesLength = 0;  // Keeping our own length var is faster in JS.
    var lastequality = null;
    var pointer = 0;  // Index of current position.
    var length_insertions1 = 0;
    var length_deletions1 = 0;
    var length_insertions2 = 0;
    var length_deletions2 = 0;
    while (pointer < diffs.length) {
      if (diffs[pointer][0] == DIFF_EQUAL) {  // Equality found.
        equalities[equalitiesLength++] = pointer;
        length_insertions1 = length_insertions2;
        length_deletions1 = length_deletions2;
        length_insertions2 = 0;
        length_deletions2 = 0;
        lastequality = diffs[pointer][1];
      } else {  // An insertion or deletion.
        if (diffs[pointer][0] == DIFF_INSERT) {
          length_insertions2 += diffs[pointer][1].length;
        } else {
          length_deletions2 += diffs[pointer][1].length;
        }
        if (lastequality && (lastequality.length <=
                             Math.max(length_insertions1, length_deletions1)) &&
            (lastequality.length <= Math.max(length_insertions2,
                                             length_deletions2))) {
          diffs.splice(equalities[equalitiesLength - 1], 0,
                       [DIFF_DELETE, lastequality]);
          diffs[equalities[equalitiesLength - 1] + 1][0] = DIFF_INSERT;
          equalitiesLength--;
          equalitiesLength--;
          pointer = equalitiesLength > 0 ? equalities[equalitiesLength - 1] : -1;
          length_insertions1 = 0;  // Reset the counters.
          length_deletions1 = 0;
          length_insertions2 = 0;
          length_deletions2 = 0;
          lastequality = null;
          changes = true;
        }
      }
      pointer++;
    }
    if (changes) {
      this.diff_cleanupMerge(diffs);
    }
    this.diff_cleanupSemanticLossless(diffs);
    pointer = 1;
    while (pointer < diffs.length) {
      if (diffs[pointer - 1][0] == DIFF_DELETE &&
          diffs[pointer][0] == DIFF_INSERT) {
        var deletion = diffs[pointer - 1][1];
        var insertion = diffs[pointer][1];
        var overlap_length1 = this.diff_commonOverlap_(deletion, insertion);
        var overlap_length2 = this.diff_commonOverlap_(insertion, deletion);
        if (overlap_length1 >= overlap_length2) {
          if (overlap_length1 >= deletion.length / 2 ||
              overlap_length1 >= insertion.length / 2) {
            diffs.splice(pointer, 0,
                         [DIFF_EQUAL, insertion.substring(0, overlap_length1)]);
            diffs[pointer - 1][1] =
              deletion.substring(0, deletion.length - overlap_length1);
            diffs[pointer + 1][1] = insertion.substring(overlap_length1);
            pointer++;
          }
        } else {
          if (overlap_length2 >= deletion.length / 2 ||
              overlap_length2 >= insertion.length / 2) {
            diffs.splice(pointer, 0,
                         [DIFF_EQUAL, deletion.substring(0, overlap_length2)]);
            diffs[pointer - 1][0] = DIFF_INSERT;
            diffs[pointer - 1][1] =
              insertion.substring(0, insertion.length - overlap_length2);
            diffs[pointer + 1][0] = DIFF_DELETE;
            diffs[pointer + 1][1] =
              deletion.substring(overlap_length2);
            pointer++;
          }
        }
        pointer++;
      }
      pointer++;
    }
  };
  Diff.prototype.diff_cleanupSemanticLossless = function(diffs) {
    function diff_cleanupSemanticScore_(one, two) {
      if (!one || !two) {
        return 6;
      }
      var char1 = one.charAt(one.length - 1);
      var char2 = two.charAt(0);
      var nonAlphaNumeric1 = char1.match(Diff.nonAlphaNumericRegex_);
      var nonAlphaNumeric2 = char2.match(Diff.nonAlphaNumericRegex_);
      var whitespace1 = nonAlphaNumeric1 &&
            char1.match(Diff.whitespaceRegex_);
      var whitespace2 = nonAlphaNumeric2 &&
            char2.match(Diff.whitespaceRegex_);
      var lineBreak1 = whitespace1 &&
            char1.match(Diff.linebreakRegex_);
      var lineBreak2 = whitespace2 &&
            char2.match(Diff.linebreakRegex_);
      var blankLine1 = lineBreak1 &&
            one.match(Diff.blanklineEndRegex_);
      var blankLine2 = lineBreak2 &&
            two.match(Diff.blanklineStartRegex_);
      if (blankLine1 || blankLine2) {
        return 5;
      } else if (lineBreak1 || lineBreak2) {
        return 4;
      } else if (nonAlphaNumeric1 && !whitespace1 && whitespace2) {
        return 3;
      } else if (whitespace1 || whitespace2) {
        return 2;
      } else if (nonAlphaNumeric1 || nonAlphaNumeric2) {
        return 1;
      }
      return 0;
    }
    var pointer = 1;
    while (pointer < diffs.length - 1) {
      if (diffs[pointer - 1][0] == DIFF_EQUAL &&
          diffs[pointer + 1][0] == DIFF_EQUAL) {
        var equality1 = diffs[pointer - 1][1];
        var edit = diffs[pointer][1];
        var equality2 = diffs[pointer + 1][1];
        var commonOffset = this.diff_commonSuffix(equality1, edit);
        if (commonOffset) {
          var commonString = edit.substring(edit.length - commonOffset);
          equality1 = equality1.substring(0, equality1.length - commonOffset);
          edit = commonString + edit.substring(0, edit.length - commonOffset);
          equality2 = commonString + equality2;
        }
        var bestEquality1 = equality1;
        var bestEdit = edit;
        var bestEquality2 = equality2;
        var bestScore = diff_cleanupSemanticScore_(equality1, edit) +
              diff_cleanupSemanticScore_(edit, equality2);
        while (edit.charAt(0) === equality2.charAt(0)) {
          equality1 += edit.charAt(0);
          edit = edit.substring(1) + equality2.charAt(0);
          equality2 = equality2.substring(1);
          var score = diff_cleanupSemanticScore_(equality1, edit) +
                diff_cleanupSemanticScore_(edit, equality2);
          if (score >= bestScore) {
            bestScore = score;
            bestEquality1 = equality1;
            bestEdit = edit;
            bestEquality2 = equality2;
          }
        }
        if (diffs[pointer - 1][1] != bestEquality1) {
          if (bestEquality1) {
            diffs[pointer - 1][1] = bestEquality1;
          } else {
            diffs.splice(pointer - 1, 1);
            pointer--;
          }
          diffs[pointer][1] = bestEdit;
          if (bestEquality2) {
            diffs[pointer + 1][1] = bestEquality2;
          } else {
            diffs.splice(pointer + 1, 1);
            pointer--;
          }
        }
      }
      pointer++;
    }
  };
  Diff.nonAlphaNumericRegex_ = /[^a-zA-Z0-9]/;
  Diff.whitespaceRegex_ = /\s/;
  Diff.linebreakRegex_ = /[\r\n]/;
  Diff.blanklineEndRegex_ = /\n\r?\n$/;
  Diff.blanklineStartRegex_ = /^\r?\n\r?\n/;
  Diff.prototype.diff_cleanupEfficiency = function(diffs) {
    var changes = false;
    var equalities = [];  // Stack of indices where equalities are found.
    var equalitiesLength = 0;  // Keeping our own length var is faster in JS.
    var lastequality = null;
    var pointer = 0;  // Index of current position.
    var pre_ins = false;
    var pre_del = false;
    var post_ins = false;
    var post_del = false;
    while (pointer < diffs.length) {
      if (diffs[pointer][0] == DIFF_EQUAL) {  // Equality found.
        if (diffs[pointer][1].length < this.Diff_EditCost &&
            (post_ins || post_del)) {
          equalities[equalitiesLength++] = pointer;
          pre_ins = post_ins;
          pre_del = post_del;
          lastequality = diffs[pointer][1];
        } else {
          equalitiesLength = 0;
          lastequality = null;
        }
        post_ins = post_del = false;
      } else {  // An insertion or deletion.
        if (diffs[pointer][0] == DIFF_DELETE) {
          post_del = true;
        } else {
          post_ins = true;
        }
        if (lastequality && ((pre_ins && pre_del && post_ins && post_del) ||
                             ((lastequality.length < this.Diff_EditCost / 2) &&
                              (pre_ins + pre_del + post_ins + post_del) == 3))) {
          diffs.splice(equalities[equalitiesLength - 1], 0,
                       [DIFF_DELETE, lastequality]);
          diffs[equalities[equalitiesLength - 1] + 1][0] = DIFF_INSERT;
          equalitiesLength--;  // Throw away the equality we just deleted;
          lastequality = null;
          if (pre_ins && pre_del) {
            post_ins = post_del = true;
            equalitiesLength = 0;
          } else {
            equalitiesLength--;  // Throw away the previous equality.
            pointer = equalitiesLength > 0 ?
              equalities[equalitiesLength - 1] : -1;
            post_ins = post_del = false;
          }
          changes = true;
        }
      }
      pointer++;
    }
    if (changes) {
      this.diff_cleanupMerge(diffs);
    }
  };
  Diff.prototype.diff_cleanupMerge = function(diffs) {
    diffs.push([DIFF_EQUAL, '']);  // Add a dummy entry at the end.
    var pointer = 0;
    var count_delete = 0;
    var count_insert = 0;
    var text_delete = '';
    var text_insert = '';
    var commonlength;
    while (pointer < diffs.length) {
      switch (diffs[pointer][0]) {
      case DIFF_INSERT:
        count_insert++;
        text_insert += diffs[pointer][1];
        pointer++;
        break;
      case DIFF_DELETE:
        count_delete++;
        text_delete += diffs[pointer][1];
        pointer++;
        break;
      case DIFF_EQUAL:
        if (count_delete + count_insert > 1) {
          if (count_delete !== 0 && count_insert !== 0) {
            commonlength = this.diff_commonPrefix(text_insert, text_delete);
            if (commonlength !== 0) {
              if ((pointer - count_delete - count_insert) > 0 &&
                  diffs[pointer - count_delete - count_insert - 1][0] ==
                  DIFF_EQUAL) {
                diffs[pointer - count_delete - count_insert - 1][1] +=
                  text_insert.substring(0, commonlength);
              } else {
                diffs.splice(0, 0, [DIFF_EQUAL,
                                    text_insert.substring(0, commonlength)]);
                pointer++;
              }
              text_insert = text_insert.substring(commonlength);
              text_delete = text_delete.substring(commonlength);
            }
            commonlength = this.diff_commonSuffix(text_insert, text_delete);
            if (commonlength !== 0) {
              diffs[pointer][1] = text_insert.substring(text_insert.length -
                                                        commonlength) + diffs[pointer][1];
              text_insert = text_insert.substring(0, text_insert.length -
                                                  commonlength);
              text_delete = text_delete.substring(0, text_delete.length -
                                                  commonlength);
            }
          }
          if (count_delete === 0) {
            diffs.splice(pointer - count_insert,
                         count_delete + count_insert, [DIFF_INSERT, text_insert]);
          } else if (count_insert === 0) {
            diffs.splice(pointer - count_delete,
                         count_delete + count_insert, [DIFF_DELETE, text_delete]);
          } else {
            diffs.splice(pointer - count_delete - count_insert,
                         count_delete + count_insert, [DIFF_DELETE, text_delete],
                         [DIFF_INSERT, text_insert]);
          }
          pointer = pointer - count_delete - count_insert +
            (count_delete ? 1 : 0) + (count_insert ? 1 : 0) + 1;
        } else if (pointer !== 0 && diffs[pointer - 1][0] == DIFF_EQUAL) {
          diffs[pointer - 1][1] += diffs[pointer][1];
          diffs.splice(pointer, 1);
        } else {
          pointer++;
        }
        count_insert = 0;
        count_delete = 0;
        text_delete = '';
        text_insert = '';
        break;
      }
    }
    if (diffs[diffs.length - 1][1] === '') {
      diffs.pop();  // Remove the dummy entry at the end.
    }
    var changes = false;
    pointer = 1;
    while (pointer < diffs.length - 1) {
      if (diffs[pointer - 1][0] == DIFF_EQUAL &&
          diffs[pointer + 1][0] == DIFF_EQUAL) {
        if (diffs[pointer][1].substring(diffs[pointer][1].length -
                                        diffs[pointer - 1][1].length) == diffs[pointer - 1][1]) {
          diffs[pointer][1] = diffs[pointer - 1][1] +
            diffs[pointer][1].substring(0, diffs[pointer][1].length -
                                        diffs[pointer - 1][1].length);
          diffs[pointer + 1][1] = diffs[pointer - 1][1] + diffs[pointer + 1][1];
          diffs.splice(pointer - 1, 1);
          changes = true;
        } else if (diffs[pointer][1].substring(0, diffs[pointer + 1][1].length) ==
                   diffs[pointer + 1][1]) {
          diffs[pointer - 1][1] += diffs[pointer + 1][1];
          diffs[pointer][1] =
            diffs[pointer][1].substring(diffs[pointer + 1][1].length) +
            diffs[pointer + 1][1];
          diffs.splice(pointer + 1, 1);
          changes = true;
        }
      }
      pointer++;
    }
    if (changes) {
      this.diff_cleanupMerge(diffs);
    }
  };
  Diff.prototype.diff_xIndex = function(diffs, loc) {
    var chars1 = 0;
    var chars2 = 0;
    var last_chars1 = 0;
    var last_chars2 = 0;
    var x;
    for (x = 0; x < diffs.length; x++) {
      if (diffs[x][0] !== DIFF_INSERT) {  // Equality or deletion.
        chars1 += diffs[x][1].length;
      }
      if (diffs[x][0] !== DIFF_DELETE) {  // Equality or insertion.
        chars2 += diffs[x][1].length;
      }
      if (chars1 > loc) {  // Overshot the location.
        break;
      }
      last_chars1 = chars1;
      last_chars2 = chars2;
    }
    if (diffs.length != x && diffs[x][0] === DIFF_DELETE) {
      return last_chars2;
    }
    return last_chars2 + (loc - last_chars1);
  };
  Diff.prototype.diff_text1 = function(diffs) {
    var text = [];
    for (var x = 0; x < diffs.length; x++) {
      if (diffs[x][0] !== DIFF_INSERT) {
        text[x] = diffs[x][1];
      }
    }
    return text.join('');
  };
  Diff.prototype.diff_text2 = function(diffs) {
    var text = [];
    for (var x = 0; x < diffs.length; x++) {
      if (diffs[x][0] !== DIFF_DELETE) {
        text[x] = diffs[x][1];
      }
    }
    return text.join('');
  };
  Diff.prototype.diff_levenshtein = function(diffs) {
    var levenshtein = 0;
    var insertions = 0;
    var deletions = 0;
    for (var x = 0; x < diffs.length; x++) {
      var op = diffs[x][0];
      var data = diffs[x][1];
      switch (op) {
      case DIFF_INSERT:
        insertions += data.length;
        break;
      case DIFF_DELETE:
        deletions += data.length;
        break;
      case DIFF_EQUAL:
        levenshtein += Math.max(insertions, deletions);
        insertions = 0;
        deletions = 0;
        break;
      }
    }
    levenshtein += Math.max(insertions, deletions);
    return levenshtein;
  };
  Diff.prototype.diff_toDelta = function(diffs) {
    var text = [];
    for (var x = 0; x < diffs.length; x++) {
      switch (diffs[x][0]) {
      case DIFF_INSERT:
        text[x] = '+' + encodeURI(diffs[x][1]);
        break;
      case DIFF_DELETE:
        text[x] = '-' + diffs[x][1].length;
        break;
      case DIFF_EQUAL:
        text[x] = '=' + diffs[x][1].length;
        break;
      }
    }
    return text.join('\t').replace(/%20/g, ' ');
  };
  Diff.prototype.diff_fromDelta = function(text1, delta) {
    var diffs = [];
    var diffsLength = 0;  // Keeping our own length var is faster in JS.
    var pointer = 0;  // Cursor in text1
    var tokens = delta.split(/\t/g);
    for (var x = 0; x < tokens.length; x++) {
      var param = tokens[x].substring(1);
      switch (tokens[x].charAt(0)) {
      case '+':
        try {
          diffs[diffsLength++] = [DIFF_INSERT, decodeURI(param)];
        } catch (ex) {
          throw new Error('Illegal escape in diff_fromDelta: ' + param);
        }
        break;
      case '-':
      case '=':
        var n = parseInt(param, 10);
        if (isNaN(n) || n < 0) {
          throw new Error('Invalid number in diff_fromDelta: ' + param);
        }
        var text = text1.substring(pointer, pointer += n);
        if (tokens[x].charAt(0) == '=') {
          diffs[diffsLength++] = [DIFF_EQUAL, text];
        } else {
          diffs[diffsLength++] = [DIFF_DELETE, text];
        }
        break;
      default:
        if (tokens[x]) {
          throw new Error('Invalid diff operation in diff_fromDelta: ' +
                          tokens[x]);
        }
      }
    }
    if (pointer != text1.length) {
      throw new Error('Delta length (' + pointer +
                      ') does not equal source text length (' + text1.length + ').');
    }
    return diffs;
  };
  return Diff;
});
