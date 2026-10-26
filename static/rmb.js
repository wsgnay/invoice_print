function uppercaseRmb(totalCents) {
  if (!Number.isSafeInteger(totalCents)) throw new RangeError('金额超出可计算范围');
  const digits = '零壹贰叁肆伍陆柒捌玖';
  const smallUnits = ['', '拾', '佰', '仟'];
  const largeUnits = ['', '万', '亿', '兆'];
  const absolute = Math.abs(totalCents);
  const groups = String(Math.floor(absolute / 100)).replace(/\B(?=(\d{4})+(?!\d))/g, ',').split(',');
  let whole = '';
  let skipped = false;
  groups.forEach((part, index) => {
    const value = Number(part);
    if (!value) {
      skipped = true;
      return;
    }
    if (whole && (skipped || value < 1000)) whole += '零';
    let section = '';
    let gap = false;
    [...part].forEach((char, position) => {
      const digit = Number(char);
      if (!digit) {
        if (section) gap = true;
        return;
      }
      if (gap) section += '零';
      section += digits[digit] + smallUnits[part.length - position - 1];
      gap = false;
    });
    whole += section + largeUnits[groups.length - index - 1];
    skipped = false;
  });
  const jiao = Math.floor(absolute / 10) % 10;
  const fen = absolute % 10;
  let fraction = jiao || fen ? (jiao ? digits[jiao] + '角' : '零') + (fen ? digits[fen] + '分' : '') : '整';
  return (totalCents < 0 ? '负' : '') + (whole || '零') + '元' + fraction;
}

if (typeof module !== 'undefined') module.exports = {uppercaseRmb};
