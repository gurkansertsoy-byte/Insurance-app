# Sigorta Portföy

An HTML application for insurance agencies. It reads the agency's monthly production Excel file
(one sheet per month), keeps every row in the browser, matches the same customer across months,
and gives one screen per customer with everything they have bought in every month. **Every change
made in the app is written back into that same Excel file, on the page of its month, a moment after
it is saved — there is no save button.** The İptal block at the end of each page (ŞİRKET | POLİÇE |
SİGORTALI AD SOYAD | KART | CARİ | NAKİT) is read as cancellations of earlier policies. On top of
that: an easy entry form, renewal tracking with WhatsApp reminders, on-account (cari) collections,
tasks, reports and Excel exports in the agency's own column layout.

*Türkçe özet:* Acentenin her ayı ayrı sayfada tutulan üretim Excel'ini okur, tüm satırları
tarayıcıda saklar, aynı müşteriyi aylar arasında TC / ad + telefon / plaka ile eşleştirir ve
müşterinin bütün aylardaki poliçelerini tek kartta gösterir. **Uygulamada yapılan her değişiklik
(yeni kayıt, düzenleme, iptal) birkaç saniye içinde aynı Excel dosyasının ilgili ay sayfasına
kendiliğinden yazılır; kaydet düğmesine basmak gerekmez.** Her sayfanın sonundaki ŞİRKET / POLİÇE /
SİGORTALI AD SOYAD / KART / CARİ / NAKİT bölümüne yazılan satırlar iptal olarak okunur ve önceki
aylardaki eşleşen poliçe iptal edilir. Yeni kayıt formu, yenileme takibi, WhatsApp hatırlatma, cari
tahsilat, görevler, raporlar ve aynı sütun düzeninde Excel çıktısı vardır. Veriler hiçbir sunucuya
gönderilmez.

![Dashboard](docs/screenshots/05-dashboard.png)

## Open it

| Way | How |
| --- | --- |
| **One file (easiest)** | Download [`dist/sigorta-portfoy.html`](dist/sigorta-portfoy.html) and double-click it. Works offline in Chrome, Edge, Firefox and Safari; nothing to install. |
| From the repository | Open `index.html` directly, or run `npm run serve` and go to http://127.0.0.1:8080 |

On the first screen choose your Excel file, or press **Örnek veriyle dene** to load the sample
workbook (`sample-data/ornek-portfoy.xlsx`: 13 monthly sheets, 705 policies, 321 fictional customers,
22 İptal rows). The interface is Turkish; an English version is one click away (EN button in the top bar).

Saving straight into your Excel file needs **Chrome or Edge** on a computer (they let a web page write
to a file you picked). In Firefox and Safari the app keeps an up-to-date copy of your workbook instead,
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
| Kart / Cari / Nakit | Kart, Kredi kartı, POS / Cari, Cari hesap, Veresiye / Nakit, Peşin, Elden |
| Also | Başlangıç tarihi, Tanzim tarihi, E-posta, Doğum tarihi, Adres, Net prim, Temsilci |

### 2. Every change goes into your Excel file, automatically

| | |
| --- | --- |
| ![Save to this file](docs/screenshots/31-import-autosave.png) | ![Linked](docs/screenshots/32-import-linked.png) |
| When you import an `.xlsx`, **Bu Excel dosyasına otomatik kaydet** is ticked. The browser asks once whether the app may edit the file. | From then on the app writes into that file by itself. |
| ![Saved](docs/screenshots/33-excel-saved.png) | ![In the file](docs/screenshots/35-excel-file-new-row.png) |
| *Yeni kayıt* → *Kaydet*: a moment later the menu says **Excel'e kaydedildi**. | The same record in the workbook (open it again in Excel): on the Ekim 2026 page, right under the last row, with the page's own spelling (EVET, TC as a number, dates as dates). A cancellation made in the app went into the next empty row of that page's İptal block. |

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

### 3. İptal: cancellations at the end of each page

| | |
| --- | --- |
| ![Month İptal block](docs/screenshots/38-month-cancels.png) | ![Cancelled policy](docs/screenshots/40-customer-cancelled.png) |
| Each page's İptal block (wherever it starts: column T, U, Z …) is read row by row. Each row is matched to the policy it cancels in that month or an earlier one, by the insured person's name, the company, the line of business or a policy number in POLİÇE, and the refund amount. | The matched policy is marked **İptal · Eki 26** on the customer card and leaves renewals; a refund written to CARİ lowers the customer's balance. |
| ![Two possible policies](docs/screenshots/39-cancel-picker.png) | ![Cancel from the app](docs/screenshots/34-cancel-dialog.png) |
| When two policies fit equally well (two traffic policies of the same person), the row waits for you to pick; a row with no policy is marked as such. Your choice is kept on every later import. | Cancelling from the app (the ⊘ button on a policy) asks for the month and the refund (Kart / Cari / Nakit, or "whole premium") and writes the row into that month's İptal block. |

### 4. One card per customer, across all months

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

### 5. Easy entry

| | |
| --- | --- |
| ![Entry form](docs/screenshots/12-new-policy-form.png) | ![Pick a customer](docs/screenshots/11-new-policy-pick-customer.png) |
| All columns of the monthly sheet in one form: TC check digits, phone and plate formatted as you type, end date = start + 1 year, commission from the rate, payment split check (Kart + Nakit + Cari = prim), extra columns. Ctrl + S saves; "Kaydet ve yeni" keeps the customer for the next policy. | Typing a name (or a TC number already on file) offers the existing customer, so the new policy lands on the same card. |

### 6. Months, policies, renewals, collections, tasks

| | |
| --- | --- |
| ![Months](docs/screenshots/13-months.png) | ![One month](docs/screenshots/14-month-detail.png) |
| One card per month (= one sheet): policies, new business, premium, commission and change. | A month exactly as in the Excel sheet, with its own columns; add a row to that month or export it. |
| ![Policies](docs/screenshots/15-policies.png) | ![Renewals](docs/screenshots/16-renewals.png) |
| All policies with filters (month range, company, branch, new/renewal, payment, status). | Renewals by days left; renewed policies are found automatically in later months. Status (called, quoted, renewed, lost + reason), a ready WhatsApp message, reminder task, one-click renewal form. |
| ![Collections](docs/screenshots/17-collections.png) | ![Payment](docs/screenshots/18-payment.png) |
| Amounts written to *Cari*: open balances (largest first), the oldest unpaid one, what was collected this month. | Partial or full payments by cash, card or transfer. |
| ![Tasks](docs/screenshots/19-tasks.png) | ![Reports](docs/screenshots/20-reports.png) |
| Tasks with due dates, linked to customers; overdue ones show in the menu. | Reports for any period: monthly production, new vs renewal, payment split, companies, branches, professions, top customers, renewal rate, cross-sell list; print or export to Excel. |

### 7. Settings, backup and your data

| | |
| --- | --- |
| ![Settings](docs/screenshots/21-settings.png) | ![Duplicates](docs/screenshots/22-duplicates.png) |
| Agency details, language, theme, rows per page, hiding TC numbers on screen (KVKK), renewal window, WhatsApp template. Backup to one `.json` file and restore; whole portfolio to Excel (one sheet per month in your own column order + summary + customers). | Finds customers that may be the same person and merges them. |

Data stays on this computer: it is kept in the browser's database (IndexedDB) and in your own Excel
file, and is never sent anywhere. Take a backup regularly (the menu shows when the last one was taken);
a backup restores everything on another computer or browser.

### 8. Print, English, dark mode, phone

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
npm test             # unit tests (Node): parsing, TC/VKN check digits, dates, amounts, import, matching, İptal, export, writing back to the workbook
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
