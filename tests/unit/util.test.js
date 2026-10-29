'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const U = require('../../js/core/util.js');

test('fold strips Turkish letters, case and punctuation', () => {
  assert.equal(U.fold('POLİÇE Bitiş-Tarihi'), 'police bitis tarihi');
  assert.equal(U.fold('Şirket poliçe tutarı'), 'sirket police tutari');
  assert.equal(U.fold('IĞDIR'), 'igdir');
  assert.equal(U.fold('  Tc  kimlik/no '), 'tc kimlik no');
});

test('titleCase and tidyName handle Turkish casing', () => {
  assert.equal(U.titleCase('İSMAİL ŞAHİN'), 'İsmail Şahin');
  assert.equal(U.titleCase('ışık ılgaz'), 'Işık Ilgaz');
  assert.equal(U.tidyName('AHMET YILMAZ'), 'Ahmet Yılmaz');
  assert.equal(U.tidyName('mehmet ali kaya'), 'Mehmet Ali Kaya');
  assert.equal(U.tidyName('Ayşe van der Berg'), 'Ayşe van der Berg', 'mixed case is left alone');
  assert.equal(U.tidyName('KARDEŞLER GIDA SAN. TİC. A.Ş.'), 'Kardeşler Gıda San. Tic. A.Ş.');
});

test('TC kimlik no checksum', () => {
  assert.equal(U.isValidTCKN('10000000146'), true);
  assert.equal(U.isValidTCKN('10000000147'), false);
  assert.equal(U.isValidTCKN('01234567890'), false, 'cannot start with 0');
  assert.equal(U.isValidTCKN('1234'), false);
  assert.equal(U.idKind(10000000146), 'tckn', 'numeric cell');
  assert.equal(U.idKind('100 000 001 46'), 'tckn', 'with spaces');
  assert.equal(U.idKind('10000000147'), 'invalid');
  assert.equal(U.idKind(''), '');
});

test('vergi kimlik no checksum', () => {
  // generated with the published algorithm
  const valid = ['5869711877', '0010014473'];
  for (const v of valid) {
    const d = v.split('').map(Number);
    let sum = 0;
    for (let i = 0; i < 9; i++) { const tmp = (d[i] + 9 - i) % 10; let w = (tmp * 2 ** (9 - i)) % 9; if (tmp !== 0 && w === 0) w = 9; sum += w; }
    assert.equal((10 - (sum % 10)) % 10, d[9], 'fixture ' + v);
    assert.equal(U.isValidVKN(v), true, v);
  }
  assert.equal(U.isValidVKN('5869711878'), false);
  assert.equal(U.idKind('5869711877'), 'vkn');
});

test('normalizeId reads numbers, text and scientific notation', () => {
  assert.equal(U.normalizeId(12345678901), '12345678901');
  assert.equal(U.normalizeId('1.23456789012E+10'), '12345678901');
  assert.equal(U.normalizeId(' 123-456 '), '123456');
  assert.equal(U.maskId('12345678901'), '123••••••01');
});

test('phones are normalised to 10 digits and formatted', () => {
  for (const p of ['0532 123 45 67', '5321234567', '+90 532 123 4567', '(0532) 123-45-67', '05321234567', '0090 532 123 45 67']) {
    assert.equal(U.normalizePhone(p), '5321234567', p);
  }
  assert.equal(U.formatPhone('5321234567'), '0532 123 45 67');
  assert.equal(U.isMobile('0532 123 45 67'), true);
  assert.equal(U.isMobile('0212 444 55 66'), false);
  assert.equal(U.whatsappUrl('0532 123 45 67', 'Merhaba Ali'), 'https://wa.me/905321234567?text=Merhaba%20Ali');
  assert.equal(U.whatsappUrl('123'), '');
});

test('contact cells with phones and e-mail are split', () => {
  const c = U.extractContact('0532 123 45 67 / Ali.Kaya@Gmail.com - 0212 444 55 66');
  assert.equal(c.phone, '5321234567');
  assert.deepEqual(c.phones, ['5321234567', '2124445566']);
  assert.equal(c.email, 'ali.kaya@gmail.com');
  assert.equal(U.extractContact('ali@x.com').phone, '');
  assert.equal(U.extractContact('').phone, '');
});

test('plates are normalised and validated', () => {
  assert.equal(U.normalizePlate('34abc123'), '34 ABC 123');
  assert.equal(U.normalizePlate(' 06 - kd 1986 '), '06 KD 1986');
  assert.equal(U.normalizePlate('34 i 1234'), '34 I 1234');
  assert.equal(U.isValidPlate('34 ABC 123'), true);
  assert.equal(U.isValidPlate('99 ABC 123'), false, 'no province 99');
  assert.equal(U.plateKey('34 abc 123'), '34ABC123');
});

test('parseNumber understands Turkish and English formats', () => {
  const cases = [
    [12345.5, 12345.5], ['12.345,50', 12345.5], ['12.345', 12345], ['1.234.567,89', 1234567.89],
    ['1,234,567.89', 1234567.89], ['1234,5', 1234.5], ['₺1.234,00', 1234], ['1.234 TL', 1234],
    ['0.5', 0.5], ['-1.200,00', -1200], ['(1.200)', -1200], ['', null], ['abc', null], [null, null], ['12,5 TL', 12.5]
  ];
  for (const [input, want] of cases) assert.equal(U.parseNumber(input), want, String(input));
});

test('parseDate handles serials, Turkish dates and rejects impossible ones', () => {
  assert.equal(U.parseDate(46000), '2025-12-09');
  assert.equal(U.parseDate(46000, { date1904: true }), '2029-12-10');
  assert.equal(U.parseDate('15.03.2027'), '2027-03-15');
  assert.equal(U.parseDate('5/3/2027'), '2027-03-05', 'day first');
  assert.equal(U.parseDate('3/25/2027'), '2027-03-25', 'US order when unambiguous');
  assert.equal(U.parseDate('2027-03-15'), '2027-03-15');
  assert.equal(U.parseDate('2027-03-15T00:00:00'), '2027-03-15');
  assert.equal(U.parseDate('15.03.27'), '2027-03-15');
  assert.equal(U.parseDate('12 Ocak 2026'), '2026-01-12');
  assert.equal(U.parseDate('3 Şubat 26'), '2026-02-03');
  assert.equal(U.parseDate('31.02.2026'), null);
  assert.equal(U.parseDate('hello'), null);
  assert.equal(U.parseDate(2026), null, 'a bare year is not a date');
  assert.equal(U.parseDate('20260115'), '2026-01-15');
});

test('date arithmetic', () => {
  assert.equal(U.addYears('2024-02-29', 1), '2025-02-28');
  assert.equal(U.addMonths('2026-01-31', 1), '2026-02-28');
  assert.equal(U.addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(U.diffDays('2026-10-29', '2026-11-28'), 30);
  assert.equal(U.isoToSerial('2025-12-09'), 46000);
  assert.equal(U.addMonthsToKey('2026-01', -1), '2025-12');
});

test('month names in sheet titles', () => {
  const cases = [
    ['OCAK 2026', [1, 2026]], ['Şubat 2026', [2, 2026]], ['MART', [3, null]], ['Eylül 26', [9, 2026]],
    ['08.2026', [8, 2026]], ['2026-08', [8, 2026]], ['Temmuz-2026', [7, 2026]], ['KASIM 2025 ÜRETİM LİSTESİ', [11, 2025]],
    ['Aralik2025', [12, 2025]], ['January 2026', [1, 2026]], ['EKİM', [10, null]]
  ];
  for (const [text, [m, y]] of cases) assert.deepEqual(U.parseMonthText(text), { month: m, year: y }, text);
  assert.equal(U.parseMonthText('Sayfa1'), null);
  assert.equal(U.parseMonthText('Özet'), null);
  assert.equal(U.parseMonthText('13.2026'), null);
});

test('Yeni iş values', () => {
  for (const v of ['EVET', 'evet', 'E', 'X', 'x', '✓', 'Yeni', 'YENİ', true, 1]) assert.equal(U.parseYesNo(v), true, String(v));
  for (const v of ['HAYIR', 'Hayır', 'H', 'Yenileme', 'YENİLEME', false, 0]) assert.equal(U.parseYesNo(v), false, String(v));
  for (const v of ['', null, 'belki']) assert.equal(U.parseYesNo(v), null, String(v));
});

test('formatting uses Turkish lira and Turkish separators', () => {
  assert.equal(U.fmtMoney(12345.5, 'tr'), '₺12.345,50');
  assert.equal(U.fmtMoney(12345.5, 'en'), '₺12,345.50');
  assert.equal(U.fmtDate('2026-10-29', 'tr'), '29.10.2026');
  assert.equal(U.fmtDate('2026-10-29', 'en'), '29/10/2026');
  assert.equal(U.monthLabel('2026-02', 'tr'), 'Şubat 2026');
  assert.equal(U.monthLabel('2026-02', 'tr', true), 'Şub 26');
  assert.equal(U.monthLabel('2026-02', 'en'), 'February 2026');
});

test('company names are grouped', () => {
  assert.equal(U.companyKey('ALLİANZ'), U.companyKey('Allianz Sigorta A.Ş.'));
  assert.equal(U.companyKey('Türkiye Sigorta'), 'turkiye');
  assert.notEqual(U.companyKey('Anadolu Sigorta'), U.companyKey('Anadolu Hayat Emeklilik'));
});
