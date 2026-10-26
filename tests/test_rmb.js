const assert = require('node:assert/strict');
const {test} = require('node:test');
const {uppercaseRmb} = require('../static/rmb.js');

test('人民币合计转换为金额大写', () => {
  const examples = [
    [0, '零元整'],
    [1, '零元零壹分'],
    [100, '壹元整'],
    [101, '壹元零壹分'],
    [123591, '壹仟贰佰叁拾伍元玖角壹分'],
    [1000100, '壹万零壹元整'],
    [100000001, '壹佰万元零壹分'],
    [-12345, '负壹佰贰拾叁元肆角伍分'],
  ];
  for (const [cents, expected] of examples) assert.equal(uppercaseRmb(cents), expected);
});
