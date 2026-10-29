/* Sigorta Portföy - field definitions, Excel header synonyms and policy categories. */
(function (root, factory) {
  var mod = factory(root.U || (typeof require === 'function' ? require('./util.js') : null));
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else root.Schema = mod;
})(typeof self !== 'undefined' ? self : this, function (U) {
  'use strict';

  /*
   * key      internal name
   * type     text | name | id | phone | email | date | money | int | bool | plate
   * scope    customer (lives on the customer card) | policy (one per row)
   * excel    header used when writing Excel files (the agency's own wording)
   * syn      folded header spellings recognised on import
   * core     part of the agency's standard monthly sheet
   */
  var FIELDS = [
    { key: 'policyType', type: 'text', scope: 'policy', core: true, excel: 'Poliçe adı', tr: 'Poliçe adı', en: 'Policy name',
      syn: ['police adi', 'police turu', 'police tipi', 'police cinsi', 'brans', 'brans adi', 'urun', 'urun adi',
        'sigorta turu', 'sigorta cinsi', 'sigorta adi', 'police', 'tur', 'teminat turu'] },
    { key: 'endDate', type: 'date', scope: 'policy', core: true, excel: 'Poliçe bitiş tarihi', tr: 'Poliçe bitiş tarihi', en: 'Expiry date',
      syn: ['police bitis tarihi', 'bitis tarihi', 'bitis', 'vade sonu', 'vade bitis', 'vade bitis tarihi', 'vade tarihi',
        'police vade tarihi', 'son tarih', 'gecerlilik sonu', 'bitis t', 'police bitis', 'vade', 'police vadesi', 'bitis tar'] },
    { key: 'phone', type: 'phone', scope: 'customer', core: true, excel: 'İletişim', tr: 'İletişim', en: 'Contact',
      syn: ['iletisim', 'iletisim bilgisi', 'iletisim bilgileri', 'telefon', 'telefon no', 'telefon numarasi', 'tel', 'tel no',
        'gsm', 'gsm no', 'cep', 'cep tel', 'cep telefonu', 'cep no', 'irtibat', 'mobil', 'telefon numarasi'] },
    { key: 'profession', type: 'text', scope: 'customer', core: true, excel: 'Meslek', tr: 'Meslek', en: 'Occupation',
      syn: ['meslek', 'meslegi', 'meslek grubu', 'sektor', 'faaliyet', 'is kolu'] },
    { key: 'name', type: 'name', scope: 'customer', core: true, excel: 'Adı soyadı', tr: 'Adı soyadı', en: 'Full name',
      syn: ['adi soyadi', 'ad soyad', 'adi soyad', 'ad soyadi', 'adsoyad', 'isim', 'isim soyisim', 'ad soyad unvan',
        'adi soyadi unvani', 'unvan', 'unvani', 'musteri', 'musteri adi', 'musteri adi soyadi', 'musteri ad soyad',
        'musteri unvani', 'sigorta ettiren', 'sigorta ettiren adi soyadi', 'sigorta ettiren unvani', 'police sahibi',
        'sigortali sigorta ettiren', 'adi soyadi unvan'] },
    { key: 'tc', type: 'id', scope: 'customer', core: true, excel: 'Tc kimlik no', tr: 'TC kimlik no', en: 'National ID',
      syn: ['tc kimlik no', 'tc kimlik', 'tc kimlik numarasi', 'tc no', 'tc', 'tckn', 't c kimlik no', 't c', 'kimlik no',
        'kimlik numarasi', 'tc vkn', 'tc vergi no', 'tckn vkn', 'vkn', 'vergi no', 'vergi numarasi', 'tc kimlik vergi no',
        'kimlik vergi no', 'tc kimlik no vergi no', 'tc kn'] },
    { key: 'plate', type: 'plate', scope: 'policy', core: true, excel: 'Plaka', tr: 'Plaka', en: 'Plate',
      syn: ['plaka', 'plaka no', 'arac plaka', 'arac plakasi', 'plakasi', 'plaka numarasi'] },
    { key: 'serialNo', type: 'text', scope: 'policy', core: true, excel: 'Seri no', tr: 'Seri no', en: 'Registration serial',
      syn: ['seri no', 'seri', 'seri numarasi', 'ruhsat seri no', 'ruhsat seri', 'belge seri no', 'belge seri', 'ruhsat no',
        'ruhsat belge no', 'tescil belge seri no', 'asbis', 'asbis no', 'ruhsat'] },
    { key: 'step', type: 'int', scope: 'policy', core: true, excel: 'Basamak', tr: 'Basamak', en: 'No-claims step',
      syn: ['basamak', 'basamak no', 'kademe', 'hasarsizlik basamagi', 'hasarsizlik kademesi', 'indirim basamagi', 'tarife basamagi'] },
    { key: 'policyNo', type: 'text', scope: 'policy', core: true, excel: 'Poliçe numarası', tr: 'Poliçe numarası', en: 'Policy number',
      syn: ['police numarasi', 'police no', 'police nr', 'police num', 'pol no', 'police numara', 'police no su', 'police nosu'] },
    { key: 'premium', type: 'money', scope: 'policy', core: true, excel: 'Şirket poliçe tutarı', tr: 'Şirket poliçe tutarı', en: 'Premium',
      syn: ['sirket police tutari', 'police tutari', 'tutar', 'prim', 'brut prim', 'brut tutar', 'toplam prim', 'prim tutari',
        'police primi', 'sirket tutari', 'police bedeli', 'toplam tutar', 'brut', 'police fiyati', 'fiyat', 'ucret'] },
    { key: 'newBusiness', type: 'bool', scope: 'policy', core: true, excel: 'Yeni iş', tr: 'Yeni iş', en: 'New business',
      syn: ['yeni is', 'yeni', 'yeni is mi', 'yeni yenileme', 'yeni musteri', 'is tipi', 'yeni is yenileme', 'yeni is durumu'] },
    { key: 'commission', type: 'money', scope: 'policy', core: true, excel: 'Komisyon', tr: 'Komisyon', en: 'Commission',
      syn: ['komisyon', 'komisyon tutari', 'acente komisyonu', 'komisyon tl', 'kom', 'komisyonu', 'acente payi'] },
    { key: 'note', type: 'text', scope: 'policy', core: true, excel: 'Açıklama', tr: 'Açıklama', en: 'Notes',
      syn: ['aciklama', 'aciklamalar', 'not', 'notlar', 'yorum', 'aciklama not', 'notu'] },
    { key: 'company', type: 'text', scope: 'policy', core: true, excel: 'Şirket', tr: 'Şirket', en: 'Insurer',
      syn: ['sirket', 'sirket adi', 'sigorta sirketi', 'sigortaci', 'firma', 'sirketi', 'sigorta firmasi', 'sigorta sirket'] },
    { key: 'insuredName', type: 'name', scope: 'policy', core: true, excel: 'Sigortalı adı soyadı', tr: 'Sigortalı adı soyadı', en: 'Insured person',
      syn: ['sigortali adi soyadi', 'sigortali', 'sigortali adi', 'sigortali ad soyad', 'sigortalinin adi soyadi', 'sigortali unvan',
        'sigortali unvani', 'sigortali adi soyadi unvani'] },
    { key: 'card', type: 'money', scope: 'policy', core: true, excel: 'Kart', tr: 'Kart', en: 'Card',
      syn: ['kart', 'kredi karti', 'k karti', 'kk', 'pos', 'kart ile', 'kartla', 'kredi k'] },
    { key: 'account', type: 'money', scope: 'policy', core: true, excel: 'Cari', tr: 'Cari', en: 'On account',
      syn: ['cari', 'cari hesap', 'veresiye', 'acik hesap', 'cari bakiye', 'cariye'] },
    { key: 'cash', type: 'money', scope: 'policy', core: true, excel: 'Nakit', tr: 'Nakit', en: 'Cash',
      syn: ['nakit', 'pesin', 'elden', 'nakit odeme'] },
    // optional columns that some agencies keep
    { key: 'startDate', type: 'date', scope: 'policy', excel: 'Başlangıç tarihi', tr: 'Başlangıç tarihi', en: 'Start date',
      syn: ['baslangic tarihi', 'police baslangic tarihi', 'baslangic', 'vade baslangic', 'vade baslangic tarihi',
        'yururluk tarihi', 'baslama tarihi', 'baslangic t'] },
    { key: 'issueDate', type: 'date', scope: 'policy', excel: 'Tanzim tarihi', tr: 'Tanzim tarihi', en: 'Issue date',
      syn: ['tanzim tarihi', 'tanzim', 'duzenleme tarihi', 'kesim tarihi', 'tanzim t', 'satis tarihi', 'kayit tarihi'] },
    { key: 'email', type: 'email', scope: 'customer', excel: 'E-posta', tr: 'E-posta', en: 'Email',
      syn: ['e posta', 'eposta', 'email', 'e mail', 'mail', 'mail adresi', 'e posta adresi'] },
    { key: 'birthDate', type: 'date', scope: 'customer', excel: 'Doğum tarihi', tr: 'Doğum tarihi', en: 'Date of birth',
      syn: ['dogum tarihi', 'dogum', 'd tarihi', 'dogum t'] },
    { key: 'address', type: 'text', scope: 'customer', excel: 'Adres', tr: 'Adres', en: 'Address',
      syn: ['adres', 'adresi', 'ikamet adresi', 'acik adres', 'ev adresi'] },
    { key: 'netPremium', type: 'money', scope: 'policy', excel: 'Net prim', tr: 'Net prim', en: 'Net premium',
      syn: ['net prim', 'net tutar', 'net police tutari'] },
    { key: 'agent', type: 'text', scope: 'policy', excel: 'Temsilci', tr: 'Temsilci', en: 'Representative',
      syn: ['temsilci', 'satis temsilcisi', 'personel', 'uretici', 'satisi yapan', 'kaydi yapan', 'kaynak'] }
  ];

  // first / last name in separate columns are combined into "name"
  var NAME_PARTS = { first: ['ad', 'adi', 'isim', 'musteri adi'], last: ['soyad', 'soyadi', 'soyisim', 'musteri soyadi'] };

  var BY_KEY = {};
  FIELDS.forEach(function (f) { BY_KEY[f.key] = f; });

  var SYN = {};
  FIELDS.forEach(function (f) {
    f.syn.concat([U.fold(f.excel), U.fold(f.tr), U.fold(f.en)]).forEach(function (s) { if (!SYN[s]) SYN[s] = f.key; });
  });

  function has(toks, t) { return toks.indexOf(t) >= 0; }
  function anyStarts(toks, p) { return toks.some(function (t) { return t.indexOf(p) === 0; }); }

  /** Maps an Excel header to a field key, '_first' / '_last', or null (kept as a custom column). */
  function matchHeader(header) {
    var n = U.fold(header);
    if (!n) return null;
    if (SYN[n]) return SYN[n];
    if (NAME_PARTS.first.indexOf(n) >= 0) return '_first';
    if (NAME_PARTS.last.indexOf(n) >= 0) return '_last';
    var t = n.split(' ');
    var c = function (s) { return n.indexOf(s) >= 0; };
    if (c('sigortali')) return 'insuredName';
    if (c('sigorta ettiren') || c('police sahibi')) return 'name';
    if (has(t, 'tc') || has(t, 'tckn') || c('kimlik') || has(t, 'vkn') || c('vergi no') || c('vergi num')) return 'tc';
    if (c('bitis') || c('vade sonu') || (c('vade') && !c('baslangic'))) return 'endDate';
    if (c('baslangic') || c('yururluk')) return 'startDate';
    if (c('tanzim') || c('duzenleme tarihi')) return 'issueDate';
    if (c('dogum')) return 'birthDate';
    if (c('plaka')) return 'plate';
    if (anyStarts(t, 'seri') || c('ruhsat') || c('belge no') || c('asbis')) return 'serialNo';
    if (c('basamak') || c('kademe')) return 'step';
    if (c('police') && (has(t, 'no') || has(t, 'nr') || c('numara') || has(t, 'nosu'))) return 'policyNo';
    if (c('komisyon')) return 'commission';
    if (c('net') && (c('prim') || c('tutar'))) return 'netPremium';
    if (c('tutar') || anyStarts(t, 'prim') || c('bedel')) return 'premium';
    if ((c('police') && (has(t, 'adi') || has(t, 'turu') || has(t, 'tipi') || c('cins'))) || c('brans') || has(t, 'urun')) return 'policyType';
    if (c('sirket') || c('firma') || c('sigortaci')) return 'company';
    if (c('yeni')) return 'newBusiness';
    if (has(t, 'kart') || c('kredi kart') || has(t, 'kk')) return 'card';
    if (has(t, 'cari')) return 'account';
    if (c('nakit') || c('pesin')) return 'cash';
    if (c('aciklama') || has(t, 'not') || has(t, 'notlar')) return 'note';
    if (c('meslek')) return 'profession';
    if (c('iletisim') || has(t, 'tel') || c('telefon') || has(t, 'gsm') || has(t, 'cep')) return 'phone';
    if (c('mail') || c('posta')) return 'email';
    if (c('adres')) return 'address';
    if (c('temsilci')) return 'agent';
    if ((has(t, 'ad') || has(t, 'adi')) && (anyStarts(t, 'soyad'))) return 'name';
    if (c('isim') || c('musteri') || c('unvan')) return 'name';
    return null;
  }

  // ------------------------------------------------------------------ policy categories
  var CATEGORIES = [
    { key: 'trafik', tr: 'Trafik', en: 'Traffic (MTPL)', vehicle: true,
      match: ['trafik', 'zmss', 'zorunlu mali', 'zorunlu trafik', 'karayolu', 'kzmss'] },
    { key: 'kasko', tr: 'Kasko', en: 'Motor own damage', vehicle: true, match: ['kasko'] },
    { key: 'imm', tr: 'İMM', en: 'Motor liability (İMM)', vehicle: true,
      match: ['imm', 'ihtiyari mali', 'ihtiyari'] },
    { key: 'dask', tr: 'DASK', en: 'Earthquake (DASK)', match: ['dask', 'zorunlu deprem'] },
    { key: 'konut', tr: 'Konut', en: 'Home', match: ['konut', 'ev sigortasi', 'mesken', 'ev paket', 'evim'] },
    { key: 'isyeri', tr: 'İşyeri', en: 'Business property', match: ['isyeri', 'is yeri', 'ticari paket', 'dukkan', 'magaza', 'ofis', 'yangin', 'muhendislik', 'insaat all risk'] },
    { key: 'seyahat', tr: 'Seyahat sağlık', en: 'Travel health', match: ['seyahat', 'vize', 'yurt disi', 'yurtdisi'] },
    { key: 'saglik', tr: 'Sağlık', en: 'Health', match: ['saglik', 'tss', 'tamamlayici', 'hastalik', 'medikal', 'yatarak', 'ayakta'] },
    { key: 'ferdi', tr: 'Ferdi kaza', en: 'Personal accident', match: ['ferdi', 'kaza'] },
    { key: 'hayat', tr: 'Hayat', en: 'Life', match: ['hayat', 'bes', 'emeklilik', 'vefat'] },
    { key: 'nakliyat', tr: 'Nakliyat', en: 'Cargo', match: ['nakliyat', 'emtia', 'tasima', 'kargo'] },
    { key: 'sorumluluk', tr: 'Sorumluluk', en: 'Liability', match: ['sorumluluk', 'mesleki', 'isveren', 'mali mesuliyet'] },
    { key: 'diger', tr: 'Diğer', en: 'Other', match: [] }
  ];
  var CAT_BY_KEY = {};
  CATEGORIES.forEach(function (c) { CAT_BY_KEY[c.key] = c; });

  var catCache = new Map();
  function categoryOf(policyType) {
    var f = U.fold(policyType);
    if (catCache.has(f)) return catCache.get(f);
    var found = 'diger';
    if (f) {
      // travel health before health, compulsory earthquake before home
      for (var i = 0; i < CATEGORIES.length; i++) {
        var cat = CATEGORIES[i];
        if (cat.match.some(function (m) { return (' ' + f + ' ').indexOf(' ' + m) >= 0; })) { found = cat.key; break; }
      }
    }
    catCache.set(f, found);
    return found;
  }

  function categoryLabel(key, lang) {
    var c = CAT_BY_KEY[key] || CAT_BY_KEY.diger;
    return lang === 'en' ? c.en : c.tr;
  }

  function isVehicleCategory(key) { return !!(CAT_BY_KEY[key] && CAT_BY_KEY[key].vehicle); }

  // suggestions for the entry form (the app adds whatever appears in the data)
  var DEFAULT_POLICY_TYPES = ['Trafik', 'Kasko', 'DASK', 'Konut', 'Tamamlayıcı Sağlık', 'Özel Sağlık', 'Ferdi Kaza',
    'Seyahat Sağlık', 'İşyeri', 'İMM', 'Hayat', 'Nakliyat', 'Mesleki Sorumluluk'];
  var DEFAULT_COMPANIES = ['Allianz Sigorta', 'Anadolu Sigorta', 'Axa Sigorta', 'Aksigorta', 'Ankara Sigorta',
    'Bereket Sigorta', 'Corpus Sigorta', 'Doğa Sigorta', 'Eureko Sigorta', 'Generali Sigorta', 'HDI Sigorta',
    'Hepiyi Sigorta', 'Koru Sigorta', 'Magdeburger Sigorta', 'Mapfre Sigorta', 'Neova Sigorta', 'Quick Sigorta',
    'Ray Sigorta', 'Sompo Sigorta', 'Türkiye Sigorta', 'Türk Nippon Sigorta', 'Unico Sigorta'];
  var DEFAULT_PROFESSIONS = ['Akademisyen', 'Avukat', 'Bankacı', 'Çiftçi', 'Diş Hekimi', 'Doktor', 'Eczacı', 'Emekli',
    'Esnaf', 'Ev Hanımı', 'Hemşire', 'İşçi', 'Memur', 'Mimar', 'Muhasebeci', 'Mühendis', 'Öğrenci', 'Öğretmen',
    'Polis', 'Satış Temsilcisi', 'Serbest Meslek', 'Şoför', 'Teknisyen'];

  /** Order of columns when writing a month sheet that did not come from Excel. */
  var EXPORT_ORDER = FIELDS.filter(function (f) { return f.core; }).map(function (f) { return f.key; });
  var OPTIONAL_ORDER = FIELDS.filter(function (f) { return !f.core; }).map(function (f) { return f.key; });

  function label(key, lang) {
    var f = BY_KEY[key];
    if (!f) return key;
    return lang === 'en' ? f.en : f.tr;
  }

  return {
    FIELDS: FIELDS, BY_KEY: BY_KEY, matchHeader: matchHeader, label: label,
    CATEGORIES: CATEGORIES, categoryOf: categoryOf, categoryLabel: categoryLabel, isVehicleCategory: isVehicleCategory,
    DEFAULT_POLICY_TYPES: DEFAULT_POLICY_TYPES, DEFAULT_COMPANIES: DEFAULT_COMPANIES,
    DEFAULT_PROFESSIONS: DEFAULT_PROFESSIONS, EXPORT_ORDER: EXPORT_ORDER, OPTIONAL_ORDER: OPTIONAL_ORDER
  };
});
