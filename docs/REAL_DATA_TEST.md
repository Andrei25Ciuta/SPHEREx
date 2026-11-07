# Test cu date reale SPHEREx – ghid pas cu pas

Scop: să vedem dacă pipeline-ul nostru (căutare → cutout → orientare → timp → Find movers) merge pe **fișiere reale**, nu doar pe mock. Scriptul care face asta e `backend/scripts/fetch_real_sample.py`. Nu rulează nimic de la sine; tu decizi fiecare pas.

## Ce știm deja (rulat pe 7 nov, doar căutare, 0 fișiere descărcate)

Interogarea TAP către IRSA **merge** (3–15 s) și datele există pentru toate cele 5 obiecte test. Imagini găsite pe fiecare detector; „treceri" = grupuri de imagini la > 30 de zile distanță (Find movers are nevoie de ≥ 3):

| Obiect | Imagini | Treceri pe detector | Primul / ultimul an |
|---|---|---|---|
| **Barnard's Star** | 359 | D1–D6: câte **3** | aug. 2025 → sept. 2026 |
| Epsilon Indi B | 445 | D1, D4: 3 · D3, D6: 4 · **D2, D5: 5** | apr. 2025 → oct. 2026 |
| WISE 0855 | 256 | D1, D3, D4, D6: 3 · D2, D5: 4 | mai 2025 → mai 2026 |
| RW Aurigae | 333 | D1–D6: câte 3 | sept. 2025 → sept. 2026 |
| R Draconis (câmp adânc) | 2483 | D1, D2, D4, D5: 3 · D3, D6: doar 2 | apr. 2025 → sept. 2026 |

**Cel mai bun test: Barnard's Star.** E foarte strălucitor în infraroșu și se mișcă 10,4″/an (≈ 1,7 pixeli/an), deci se vede clar și arată dacă timpul, WCS-ul și orientarea sunt corecte. WISE 0855 e faimos, dar foarte slab la lungimile de undă SPHEREx: s-ar putea să nu se vadă deloc.

Un detector are ~35–95 de imagini în jurul unui obiect (nu 6 ca în mock): blink-ul și Find movers vor lucra cu zeci de cadre.

## Ce îmi trebuie de la tine

1. **Textul raportului** pe care îl produce scriptul (un fișier `.txt`, calea apare la sfârșit). Îl deschizi cu Notepad, selectezi tot, îl lipești în chat.
2. Atât. **Nu e nevoie de cont, parolă sau cheie** (IRSA e public). Nu trebuie să-mi dai fișiere FITS, doar raportul.

## Pașii (≈ 10 minute)

Deschide un terminal **în folderul proiectului** (`C:\Users\admin\Desktop\nasa`). Comenzile sunt aceleași în PowerShell și în Git Bash.

### Pasul B – descarcă UN singur cutout și inspectează-l

```bash
backend/.venv/Scripts/python.exe backend/scripts/fetch_real_sample.py --target barnard --download 1
```

Ce face, în ordine:
1. Caută imaginile lui Barnard's Star (≈ 10 s) și afișează tabelul de mai sus.
2. Alege **o** imagine și îți arată **adresa exactă** de pe care o descarcă (`irsa.ipac.caltech.edu`, cutout de 5′ centrat pe obiect).
3. Întreabă: `Download these 1 file(s) from irsa.ipac.caltech.edu? [y/N]`. Tastezi **`y`** și Enter. (Dacă scrie „Not downloaded”, terminalul tău nu e interactiv: rulează aceeași comandă cu `--yes` la sfârșit.)
4. Descarcă în `backend/data/real/` (folder ignorat de git). Un fișier mai mare de 40 MB e **refuzat automat**; mărimea reală nu o știu, de aceea e plasa de siguranță.
5. Îl inspectează: ce HDU-uri are, WCS-ul, cuvintele-cheie de timp și detector, lungimea de undă pe pixel, și **dacă există o sursă luminoasă exact unde spune catalogul că e Barnard's Star**.
6. Verifică dacă `backend/spherex/query.py` îl poate citi așa cum e.
7. Salvează tot în `backend/data/real/report_<data>.txt` și îți scrie calea.

**Ce îmi lipești în chat:** tot raportul (sau tot ce a apărut în terminal).

### Pasul C – doar dacă B a mers: mai multe date, verificarea mișcării

```bash
backend/.venv/Scripts/python.exe backend/scripts/fetch_real_sample.py --target barnard --download 4
```

Descarcă 4 imagini ale **aceluiași detector**, la date diferite (prima, ultima și două între ele) și pune la sfârșit un tabel „SUMMARY”: unde e steaua față de unde spune catalogul. Dacă totul e în regulă, scrie `OK: the object sits within one pixel of its catalogue track` (≈ 6″). Dacă scrie `CHECK`, tipul de decalaj îmi spune ce e greșit (constant = WCS/centru, crescător în timp = cuvântul-cheie de timp, oglindit = orientare).

Opțional: `--bandpass SPHEREx-D3` (alt detector) dacă steaua iese saturată sau lipsește la cel ales automat.

## Dacă ceva nu merge

| Ce vezi | Ce înseamnă | Ce faci |
|---|---|---|
| `SEARCH FAILED … could not reach the TAP service` | Nu ajunge la IRSA (rețea, VPN, firewall) | Încearcă din nou; lipește mesajul |
| `SEARCH FAILED … HTTP 400` / „unknown table” | IRSA a schimbat numele tabelelor/coloanelor | Scriptul listează singur ce are acum; lipește raportul |
| `DOWNLOAD FAILED: HTTP 500` | Cutout-ul nu se suprapune cu imaginea | Lipește mesajul; rulează cu alt `--download` (altă imagine) |
| `DOWNLOAD FAILED: HTTP 400` | Unitate sau mărime greșită | Lipește mesajul |
| `not a FITS file; it starts with b'<html…'` | Serverul a trimis o pagină de eroare, nu fișierul | Lipește mesajul |
| `over the 40 MB limit` | Fișierul e mai mare decât m-am așteptat | Lipește mărimea; decidem dacă o crești cu `--max-mb` |
| `backend read_frame_file: FAILED -> …` | **Normal la prima rulare**: backend-ul presupune nume de cuvinte-cheie care s-ar putea să difere | E exact informația de care am nevoie; lipește-o |
| Timeout după minute | Serverul e lent | Reîncearcă; nu e nimic stricat |

Nu se strică nimic dacă oprești scriptul (Ctrl+C) sau dacă eșuează: la un eșec nu rămâne niciun fișier pe jumătate scris.

## Ce NU faci

- Nu pui fișierele descărcate în git și nu le publici (folderul e ignorat, dar fii atent). **Termenii de utilizare / redistribuire ai datelor SPHEREx nu sunt verificați încă** (vezi `IRSA_FACTS.md`).
- Nu rula `--download` cu număr mare (zeci) până nu știm cât de mari sunt fișierele.

## Ce fac eu după ce primesc raportul

1. Corectez blocul CONFIG din `backend/spherex/query.py` (nume de cuvinte-cheie, timp din TAP în loc de header dacă `DATE` e data creării).
2. Scriu sursa de date „IRSA” pentru backend: căutare TAP + cutout-uri în paralel (7–12 fire, reîncercare, stare parțială în interfață), cu cache.
3. Pun `DATA_SOURCE = "api"` pe un caz real și rulez **Find movers pe Barnard's Star real**: dacă îl găsește singur, avem demo-ul cu date reale.
4. Actualizez `docs/DATA_CHECKLIST.md` și `docs/IRSA_FACTS.md` cu ce s-a confirmat.
