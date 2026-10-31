# Sigorta Portföy

An HTML application for insurance agencies. It reads the agency's monthly production Excel file
(one sheet per month), keeps every row in the browser, matches the same customer across months,
and gives one screen per customer with everything they have bought in every month. **Every change
made in the app is saved into a new Excel file next to yours (a copy, "… - guncel.xlsx"), on the page
of its month, a moment after it is saved — there is no save button. The file you give the app is never
changed.** The İptal block at the end of each page (ŞİRKET | POLİÇE |
SİGORTALI AD SOYAD | KART | CARİ | NAKİT) is read as cancellations of earlier policies, and so is a
policy number written again before its year is over with minus amounts (with plus amounts, the app asks).
A missing commission is counted as 10 % of the premium for Trafik and 15 % for everything else, and the
commission the insurer takes back on a cancellation is shown next to the refund. A chart shows each
month's yeni iş, yenileme, ek, zeyil and iptal rows from the YENİ İŞ column. On top of that: an easy
entry form, renewal tracking with WhatsApp reminders, a cross-sell list, tasks, reports
and Excel exports in the agency's own column layout.

*Türkçe özet:* Acentenin her ayı ayrı sayfada tutulan üretim Excel'ini okur, tüm satırları
tarayıcıda saklar, aynı müşteriyi aylar arasında TC / ad + telefon / plaka ile eşleştirir ve
müşterinin bütün aylardaki poliçelerini tek kartta gösterir. **Verdiğiniz Excel dosyası hiç
değiştirilmez: aktarırken seçtiğiniz yeni bir dosyaya ("… - guncel.xlsx") kopyası yazılır ve uygulamada
yapılan her değişiklik (yeni kayıt, düzenleme, iptal) birkaç saniye içinde o dosyanın ilgili ay
sayfasına kendiliğinden kaydedilir; kaydet düğmesine basmak gerekmez.** Her sayfanın sonundaki ŞİRKET / POLİÇE /
SİGORTALI AD SOYAD / KART / CARİ / NAKİT bölümüne yazılan satırlar iptal olarak okunur ve önceki
aylardaki eşleşen poliçe iptal edilir. Bir yıl dolmadan aynı poliçe numarasıyla (sonraki aylarda ya da
aynı sayfanın aşağısında) tekrar yazılan satır da iptal sayılır: eksi poliçe tutarı müşteriye iade, eksi
komisyon acenteden geri alınan komisyondur; tutarlar eksi değilse uygulama size sorar. Komisyon yazılmamışsa
Trafik için primin %10'u, diğerleri için %15'i sayılır; iptalde geri alınan komisyon da aynı oranlarla
(İPTAL bölümünde kart + cari + nakit tutarından) hesaplanır. YENİ İŞ sütununa göre her ay kaç yeni iş,
yenileme, ek, zeyil ve iptal olduğu grafikte gösterilir ("ek" geçen satır yalnızca Ek sayılır, boş hücre
Bilinmiyor'dur). Yeni kayıt formu, yenileme takibi, WhatsApp hatırlatma, çapraz
satış listesi, görevler, raporlar ve aynı sütun düzeninde Excel çıktısı vardır. Veriler hiçbir sunucuya
gönderilmez.

![Dashboard](docs/screenshots/05-dashboard.png)

## Open it

| Way | How |
| --- | --- |
| **One file (easiest)** | Download [`dist/sigorta-portfoy.html`](dist/sigorta-portfoy.html) and double-click it. Works offline in Chrome, Edge, Firefox and Safari; nothing to install. |
| From the repository | Open `index.html` directly, or run `npm run serve` and go to http://127.0.0.1:8080 |

On the first screen choose your Excel file, or press **Örnek veriyle dene** to load the sample
workbook (`sample-data/ornek-portfoy.xlsx`: 13 monthly sheets, 718 rows — 710 policies and 8 rows that
cancel an earlier policy by writing its number again — 321 fictional customers, 22 İptal rows). The interface is Turkish; an English version is one click away (EN button in the top bar).

Saving by itself into the new Excel file needs **Chrome or Edge** on a computer (they let a web page
write to a file you chose). In Firefox and Safari the app keeps an up-to-date copy of your workbook instead,
which you download with one click.

## What it does

### 1. Reads the monthly Excel file

| | |
| --- | --- |
| ![Start](docs/screenshots/01-welcome.png) | ![Sheets and months](docs/screenshots/02-import-preview.png) |
| Start screen: drop or choose `.xlsx`, `.xls`, `.xlsm`, `.ods` or `.csv`. | Every sheet with the month it belongs to, where the month came from (sheet name, title, dates), rows found and anything to check. |
| ![Columns](docs/screenshots/03-import-columns.png) | ![Result](docs/screenshots/04-import-result.png) |
| Column mapping per sheet, with sample values; fix a column once and it is remembered. | Result: new / updated / unchanged rows, customers matched by TC or name + phone/plate, rows to check (e.g. a TC number whose check digits are wrong). One click undoes an import. |

What the importer copes with, because real agency files look like this:

- the header row anywhere in the first 30 rows, with title lines above it ("EKİM 2026 ÜRETİM LİSTESİ");
- two-row headers (ÖDEME above Kart / Cari / Nakit) and merged cells;
- a table that ends with the İptal block's own titles (… ŞİRKET | POLİÇE NO | SİGORTALI AD SOYAD | KART | CARİ |
  NAKİT): these stay the table's columns; a page without Kart / Cari / Nakit is pointed out on the import screen;
- the same column twice (two *Meslek* or two *Poliçe bitiş tarihi* columns), different wording on
  different sheets (*Branş*, *Vade Sonu*, *TCKN*, *Sigorta Şirketi* …);
- total rows, empty rows and repeated header rows are skipped;
- unknown columns (MARKA, MODEL YILI …) are kept as extra columns and written back on export;
- the İptal block at the end of each page (ŞİRKET | POLİÇE | SİGORTALI AD SOYAD | KART | CARİ | NAKİT,
  starting in any column, after one or more empty columns) is read on its own, never as policies;
- the month from the sheet name in any form (`EKİM 2025`, `Ekim 2026`, `08.2026`, `Temmuz-2026`,
  `MART`), from the title, from the file name or from the dates;
- dates as real Excel dates or text (`05.11.2026`, `5/11/2026`), amounts as `25.000,00` or `25000`;
- CSV saved by Excel in UTF-8 or Windows-1254 (Turkish characters stay correct);
- importing the same file again adds nothing; changed rows are updated.

Columns it recognises (any spelling or upper/lower case, with or without Turkish letters):

| Field | Example headers |
| --- | --- |
| Poliçe adı | Poliçe adı, Poliçe türü, Branş, Ürün, Sigorta türü |
| Poliçe bitiş tarihi | Poliçe bitiş tarihi, Bitiş tarihi, Vade sonu, Vade tarihi |
| İletişim | İletişim, Telefon, Tel, GSM, Cep |
| Meslek | Meslek, Meslek grubu, Sektör |
| Adı soyadı | Adı soyadı, Ad soyad, Müşteri adı soyadı, Unvan |
| TC kimlik no | TC kimlik no, TC no, TCKN, Kimlik no, Vergi no (companies) |
| Plaka | Plaka, Araç plakası |
| Seri no | Seri no, Ruhsat seri no, Belge seri no |
| Basamak | Basamak, Kademe, Hasarsızlık basamağı |
| Poliçe numarası | Poliçe numarası, Poliçe no, Pol no |
| Şirket poliçe tutarı | Şirket poliçe tutarı, Poliçe tutarı, Prim, Brüt prim |
| Yeni iş | Yeni iş, Yeni / yenileme, İş tipi (Evet / Hayır, Yeni / Yenileme, E / H, X) |
| Komisyon | Komisyon, Komisyon tutarı, Acente komisyonu |
| Açıklama | Açıklama, Not, Notlar |
| Şirket | Şirket, Sigorta şirketi, Firma |
| Sigortalı adı soyadı | Sigortalı adı soyadı, Sigortalı |
| Kart / Cari / Nakit | KART / CARİ / NAKİT (also Kredi kartı, POS / Cari hesap, Veresiye / Peşin, Elden); an amount, or a tick (X, ✓, EVET) for "the whole premium paid this way" |
| Also | Başlangıç tarihi, Tanzim tarihi, E-posta, Doğum tarihi, Adres, Net prim, Temsilci |

### 2. Every change goes into a new Excel file, automatically (yours is never changed)

| | |
| --- | --- |
| ![Save to this file](docs/screenshots/31-import-autosave.png) | ![Linked](docs/screenshots/32-import-linked.png) |
| When you import an `.xlsx`, **Değişiklikleri yeni bir Excel dosyasına otomatik kaydet** is ticked. Pressing *Aktar* opens a save dialog with "… - guncel.xlsx" suggested; choosing the original file itself is refused. | A copy of your file is written there, and from then on the app saves into that new file by itself. Your original stays exactly as it was. |
| ![Saved](docs/screenshots/33-excel-saved.png) | ![In the file](docs/screenshots/35-excel-file-new-row.png) |
| *Yeni kayıt* → *Kaydet*: a moment later the menu says **Excel'e kaydedildi**. | The same record in the new workbook (open it in Excel): on the Ekim 2026 page, right under the last row, with the page's own spelling (EVET, TC as a number, dates as dates). A cancellation made in the app went into the next empty row of that page's İptal block. |

How it writes, so the file stays yours:

- only the cells that changed are written; untouched rows, blank rows, colours, borders, column widths,
  frozen panes, other sheets and formulas stay exactly as they were;
- a new record goes under the last row of **its month's page** (into ready-formatted empty rows first);
  a month the file does not have yet gets a new page copied from its neighbour ("KASIM 2026", same
  headers, same İptal block), placed in month order;
- an edit rewrites that row's changed cells; a customer's new phone number goes into all of their rows;
- a deleted record's row is removed and the rows below move up; the **TOPLAM** row follows the table
  and its totals are recalculated (SUM formulas are widened, typed totals are re-added);
- a cancellation goes into the İptal block of the month it was cancelled in; a page without a block
  gets one after its table;
- before writing, the app keeps earlier versions of the file (Ayarlar → Excel dosyası → Önceki sürümler).

| | |
| --- | --- |
| ![File open in Excel](docs/screenshots/36-excel-notice-open.png) | ![Excel card](docs/screenshots/37-settings-excel.png) |
| If the file is open in Excel (Windows locks it), saving waits and tries again by itself; close Excel and it goes through. | Ayarlar → Excel dosyası: save now, download, earlier versions, link another file, create a new `.xlsx`, unlink. |

When the browser needs you, a notice appears above the page:

- **Kaydetmeye devam etmek için Excel dosyasını seçin / İzin ver**: after the app is reopened, the browser
  asks once per session before the app may write to the file again (pick the file, or allow);
- **Excel dosyası uygulama dışında değiştirilmiş**: the file was saved in Excel since the app last wrote
  to it. *Dosyadaki değişiklikleri al* reads it again and lines its rows up with the last save, so
  edited, added or deleted rows in Excel are understood; records you changed in the app meanwhile keep
  your change and are written back. *Uygulamadakini dosyaya yaz* writes the app's data over it instead;
- **N satır silinecek**: a change that would remove more than 10 rows at once (other than deleting a
  month or a customer, which already asks) waits for a yes;
- policies deleted in Excel are offered for deletion in the app too (or written back).

An `.xls` or `.csv` cannot be written to; the app then offers to create a new `.xlsx` with all your
months, one page each, with the agency's yellow headers and İptal block.

### 3. İptal: cancellations at the end of each page, and policy numbers written again

| | |
| --- | --- |
| ![Month İptal block](docs/screenshots/38-month-cancels.png) | ![Cancelled policy](docs/screenshots/40-customer-cancelled.png) |
| Each page's İptal block (wherever it starts: column T, U, Z …) is read row by row. Each row is matched to the policy it cancels in that month or an earlier one, by the insured person's name, the company, the line of business or a policy number in POLİÇE, and the refund amount. | The matched policy is marked **İptal · Eki 26** on the customer card and leaves renewals; a refund written to CARİ lowers the customer's balance. |
| ![Two possible policies](docs/screenshots/39-cancel-picker.png) | ![Cancel from the app](docs/screenshots/34-cancel-dialog.png) |
| When two policies fit equally well (two traffic policies of the same person), the row waits for you to pick; a row with no policy is marked as such. Your choice is kept on every later import. | Cancelling from the app (the ⊘ button on a policy) asks for the month and the refund (Kart / Cari / Nakit, or "whole premium") and writes the row into that month's İptal block. |

#### The same policy number written again

| | |
| --- | --- |
| ![Cancellations page](docs/screenshots/41-cancels-page.png) | ![A minus row on its page](docs/screenshots/46-month-minus-row.png) |
| **İptaller** (in the menu) lists every cancellation: the İptal block rows and the rows that cancel by writing a policy number again, with the refund, the commission taken back, the policy it cancels and whether it was found. | A policy entered in May 2025 and entered again in July 2025, before its year is over, is cancelled in July. The app looks for the number in later months and further down the same page, and checks that the company, the insured name, the plate and the line of business agree. The row stays on its page, marked red, and is not counted as a policy. |

- **Minus amounts** (the usual way): the minus *Poliçe tutarı* is the refund to the customer, the minus
  *Komisyon* is the commission the insurer takes back from the agency. The row counts as a cancellation
  by itself.
- **Plus amounts**: the app does not guess. It asks, on the İptaller page, the dashboard and the month page,
  whether the amounts are a refund to the customer and commission taken back. **Evet, iptal** makes the
  row a cancellation; **Hayır, iptal değil** keeps it a policy. Answers are kept on every later import and
  can be undone; an automatic cancellation can also be turned back with **İptal değil**.
- *EK* or *ZEYİL* in YENİ İŞ with the same number is an addition to the policy, not a cancellation and
  not a renewal.

![Questions](docs/screenshots/42-repeat-questions.png)

#### Commission that is not written

When a row has no commission, the app counts **10 % of the premium for Trafik and 15 % for every other
policy** and shows it with ≈ (month page, policy detail, totals). The commission the insurer takes back on
a cancellation is the minus commission of the row; when none is written, it is 10 % / 15 % of the refund —
for an İptal block row, of what is written in KART, CARİ or NAKİT; for a row written again, of its
Poliçe tutarı. Reports and the Excel summary show it as *Geri alınan komisyon* and *Net komisyon*.

### 4. What YENİ İŞ says, month by month

| | |
| --- | --- |
| ![Columns](docs/screenshots/43-kinds-bars.png) | ![One chart per kind](docs/screenshots/45-kinds-split.png) |
| On the dashboard and in Reports: each month's rows by what their YENİ İŞ cell says — **yeni iş, yenileme, ek, zeyil, iptal** and **Bilinmiyor** (not known, a dashed outline) — as stacked columns, one line per kind on the same axis, or one small chart per kind with its own scale (so one or two EK or İPTAL rows a month are easy to see). Hovering a month gives all six counts; a click opens the month. | The search is case-insensitive. A cell with "ek" as a word anywhere ("imm ek", "Yenileme - Ek") counts as **Ek only**; an empty cell is **Bilinmiyor**. The table view lists the counts of every month and the İptal block rows on their own (they have no YENİ İŞ cell); the report export has the same table as its own sheet. |

![Lines](docs/screenshots/44-kinds-lines.png)

### 5. One card per customer, across all months

| | |
| --- | --- |
| ![Customer 360](docs/screenshots/08-customer-360.png) | ![Policy detail](docs/screenshots/09-policy-detail.png) |
| Every month the customer appears in, newest first, with each policy, its status and totals. | Every field of the row and where it came from (file, sheet, row number). Edit, renew, delete (with undo) or move a policy to another customer. |

The same person is recognised by, in this order: a valid TC / tax number, name + phone, name +
plate, a unique name. Two people with the same name but different TC numbers stay separate; a TC
number with wrong check digits is never used for matching and is listed for checking.
Tabs on the card: vehicles (plate, serial no, step), cross-sell opportunities, notes and call
history, payments. The card prints as a statement and exports to Excel.

| | |
| --- | --- |
| ![Customers](docs/screenshots/07-customers.png) | ![Notes](docs/screenshots/10-customer-notes.png) |
| Customer list with search, filters (company, branch, month), "in more than one month", "renewing in 30 days", "has a balance". | Notes, calls and WhatsApp messages per customer. |

![Search](docs/screenshots/06-search.png)

Search from anywhere (Ctrl + K): name, TC, phone, plate or policy number.

### 6. Easy entry

| | |
| --- | --- |
| ![Entry form](docs/screenshots/12-new-policy-form.png) | ![Pick a customer](docs/screenshots/11-new-policy-pick-customer.png) |
| All columns of the monthly sheet in one form: TC check digits, phone and plate formatted as you type, end date = start + 1 year, commission from the rate, payment split check (Kart + Nakit + Cari = prim), extra columns. Ctrl + S saves; "Kaydet ve yeni" keeps the customer for the next policy. | Typing a name (or a TC number already on file) offers the existing customer, so the new policy lands on the same card. |

### 7. Months, policies, renewals, cross-sell, tasks

| | |
| --- | --- |
| ![Months](docs/screenshots/13-months.png) | ![One month](docs/screenshots/14-month-detail.png) |
| One card per month (= one sheet): policies, new business, premium, commission and change. | A month exactly as in the Excel sheet, with its own columns; add a row to that month or export it. |
| ![Policies](docs/screenshots/15-policies.png) | ![Renewals](docs/screenshots/16-renewals.png) |
| All policies: one search box (customer, policy no, plate, TC), month, company and branch lists, and one row of choices with their counts — all, yeni iş, yenileme, ek / zeyil, renewal coming up, expired, cancelled. | Renewals by days left; renewed policies are found automatically in later months. Status (called, quoted, renewed, lost + reason), a ready WhatsApp message, reminder task, one-click renewal form. |
| ![Cross-sell](docs/screenshots/17-cross-sell.png) | |
| **Çapraz satış** (in the menu): customers who could buy one more policy — kasko for a car with only a traffic policy, a traffic policy for a car with only kasko, home insurance next to DASK and DASK next to home insurance. One button per kind with its count, search by name, plate or phone, a task in one click, Excel export. | |
| ![Tasks](docs/screenshots/19-tasks.png) | ![Reports](docs/screenshots/20-reports.png) |
| Tasks with due dates, linked to customers; overdue ones show in the menu. | Reports for any period: monthly production, YENİ İŞ kinds per month, payment split, companies, branches, professions, top customers, renewal rate, cancellations with refunds and commission taken back; print or export to Excel. |

### 8. Settings, backup and your data

| | |
| --- | --- |
| ![Settings](docs/screenshots/21-settings.png) | ![Duplicates](docs/screenshots/22-duplicates.png) |
| Agency details, language, theme, rows per page, hiding TC numbers on screen (KVKK), renewal window, WhatsApp template. Backup to one `.json` file and restore; whole portfolio to Excel (one sheet per month in your own column order + summary + customers). | Finds customers that may be the same person and merges them. |

Data stays on this computer: it is kept in the browser's database (IndexedDB) and in your own Excel
file, and is never sent anywhere. Take a backup regularly (the menu shows when the last one was taken);
a backup restores everything on another computer or browser.

### 9. Print, English, dark mode, phone

| | |
| --- | --- |
| ![Statement](docs/screenshots/23-print-statement.png) | ![English](docs/screenshots/24-english.png) |
| Customer statement laid out for paper. | Full English interface. |
| ![Dark](docs/screenshots/25-dark-dashboard.png) | ![Dark customer](docs/screenshots/26-dark-customer.png) |
| Dark theme (follows the device, or chosen in settings). | |

<p>
<img src="docs/screenshots/27-phone-dashboard.png" width="200" alt="Phone: dashboard">
<img src="docs/screenshots/28-phone-menu.png" width="200" alt="Phone: menu">
<img src="docs/screenshots/29-phone-customer.png" width="200" alt="Phone: customer">
<img src="docs/screenshots/30-phone-renewals.png" width="200" alt="Phone: renewals">
</p>

Works on phones and tablets too: the menu becomes a drawer and tables become cards.

## Development

No build step and no dependencies at run time: plain HTML, CSS and JavaScript
(`index.html`, `css/`, `js/`), with SheetJS (reading, exports) and ExcelJS (writing into the
agency's own workbook) in `vendor/`.

```
npm test             # unit tests (Node): parsing, TC/VKN check digits, dates, amounts, import, matching, İptal, repeated policy numbers, commission estimates, YENİ İŞ kinds, export, writing back to the workbook
npm run test:e2e     # browser tests (Playwright): every screen and button, automatic saving into the file, phone/tablet layouts, file:// mode
npm run build        # dist/sigorta-portfoy.html, the single-file version
npm run screenshots  # docs/screenshots/
npm run sample       # regenerate the sample workbook (Python + openpyxl)
```

```
index.html           app shell
css/app.css          styles (light and dark)
js/core/             util, schema (columns and synonyms), importer, portfolio (matching, renewals, İptal),
                     exporter, db, store, excelsync (writes into the workbook), filelink (the linked file)
js/ui/               DOM helpers, charts
js/views/            one file per screen
js/app.js            routing, top bar, menu, search
tests/unit/          Node tests
tests/e2e/           browser tests
tools/               sample generator, single-file build, screenshots, static server
```

Third-party parts: [SheetJS Community Edition](https://sheetjs.com) 0.20.3 (Apache 2.0),
[ExcelJS](https://github.com/exceljs/exceljs) 4.4.0 (MIT), IBM Plex Sans and Mono (SIL OFL 1.1),
Lucide icons (ISC). Their licence files are next to them.

Testing note: Chrome for Testing 153 (the browser Playwright uses here) crashes when a file handle is
read back from IndexedDB. The app guards against it: if the browser ever goes down while reading the
stored handle, that Chrome version keeps none and the file is simply picked again once per session.
The browser tests run the app in that mode.
