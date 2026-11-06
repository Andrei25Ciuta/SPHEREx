# Plan frontend v2 – „începem de la 0” (gândire, nu cod)

Stare: 6 nov 2026. **Nu conține implementare.** Codul existent e un prototip util (dacă regula despre dezvoltarea înainte de 14 nov permite refolosirea lui), dar aici regândim experiența de la zero.
Ghid folosit: skill-ul `ecc:frontend-design-direction` (direcție clară, stări, verificare pe randare reală) + lecția din [LESSON_SPHEREX.md](LESSON_SPHEREX.md).

---

## 0. Decizii confirmate (6 nov, răspunsurile tale)

| Întrebare | Decizie | Consecință pentru design |
|---|---|---|
| Public | **Jurați + recrutori / HR + alții** (proiectul va fi și în CV) | Două straturi: **experiența de demo** (30 s, impecabilă) și **vitrina de inginerie** (README, arhitectură, teste, CI, istoric curat, demo public). Vezi 0.2 |
| Ton | **Tehnic, calm pentru ochi** | „Consolă de observator”; paletă din 0.1 |
| Limbă | **Doar engleză** | Tot textul din UI, docs publice și predare în engleză |
| Accent | **Descoperire** | **Find movers** + panoul de candidați devin axa proiectului; ghidare minimă (vezi 0.3) |
| Temă | **Doar închisă** (plus contrast mare și mișcare redusă ca setări de accesibilitate) | O singură temă de proiectat bine |
| Nume | **SPHEREx Blink** (momentan) | — |
| Video | **Probabil** demo-ul principal | Modul Presenter se proiectează din start (simplu: ascunde bara, text mare, legende) |
| Dispozitiv | **Toate** (laptop, telefon, proiector) | Responsive complet; pentru **proiector**: contrast mare, text mare, fără gri-pe-gri subtil (proiectoarele „spală” tonurile închise) |
| Referințe | *(necompletat)* | **Rămâne de completat de tine** |
| Ce nu vrei să vezi | *(necompletat)* | **Rămâne de completat de tine** |

### 0.1 Paleta ta, verificată numeric (contrast WCAG)

| Rol | Culoare | Utilizare | Verificare |
|---|---|---|---|
| `--bg` | `#141619` | fundal principal, zona imaginii | — |
| `--surface` | `#2C2E3A` | panouri, bare de unelte, câmpuri | 1,35:1 față de `--bg` (suficient doar ca „suprafață”, nu ca linie) |
| `--deep` | `#050A44` | tentă pentru antet / inspector | 1,02:1 față de `--bg`: **aproape aceeași luminozitate**, se vede ca nuanță, nu ca delimitare → separă cu o linie de 1 px |
| `--primary` | `#0A21C0` | **umpleri**: buton principal, filă activă, selecție | text `#B3B4BD` pe el = **5,11:1** ✓; alb pe el = **10,54:1** ✓ |
| `--text` | `#B3B4BD` | text normal | pe `--bg` = **8,79:1** ✓; pe `--surface` = **6,53:1** ✓; pe `--deep` = 8,98:1 ✓ |

**Regulă importantă:** `#0A21C0` pe fundal închis are doar **1,72:1** (pe `--surface`: 1,28:1). **Nu-l folosi pentru text, linii, pictograme sau contururi** pe fundal închis (minimum 3:1 pentru elemente grafice, 4,5:1 pentru text). Folosește-l **doar ca umplere** cu text deschis deasupra.

Completări necesare (de definit, apoi de validat):
- **Inel de focus:** `--text` (`#B3B4BD`, 8,79:1) cu decalaj de 2 px, nu albastrul.
- **Text pentru titluri:** o nuanță mai deschisă decât `--text`, pentru ierarhie.
- **Culori de date** (separate de albastrul interfeței, ca să nu se confunde): portocaliu / albastru deschis pentru Difference, verde pentru poziția prezisă, galben pentru apertură, roșu pentru flag-uri. Trebuie **revalidate** pe noile suprafețe (cele de acum au fost validate pe `#1a1d2e`).
- **Calm pentru ochi:** albastrul `#0A21C0` e foarte saturat; folosit pe suprafețe mari „vibrează” pe fundal închis. Îl păstrăm rar (butoane, selecție), iar restul interfeței rămâne neutru. Imaginea (zona neagră) rămâne eroul vizual.

### 0.2 Stratul „CV / recrutori”

Un recrutor sau un inginer petrece 1–3 minute. Ce îl convinge, în ordine:
1. **README clar la început:** ce face, un GIF, link la demo, stack-ul, ce ai făcut tu.
2. **Demo live** care merge din prima (fără instalare).
3. **Semne de inginerie:** arhitectură documentată (`ARCHITECTURE.md`, decizii în ADR-uri), **teste automate și CI**, istoric de commit-uri curat, cod organizat, accesibilitate, performanță măsurată (Lighthouse).
4. **Rigoare științifică:** validare pe obiecte cunoscute, limite recunoscute onest.
5. **O poveste scurtă de proiect** (problema → decizii → rezultate) pentru CV și LinkedIn.

**Despre AI și CV (sfat sincer):** proiectul a fost construit cu mine (Claude Code). Spune asta onest și descrie *rolul tău real*: ce ai decis, ce ai verificat, ce ai înțeles. La interviu vei fi întrebat despre cod; **înțelege ce ai în repo** (de aceea lecția și testul) și nu pretinde că ai scris singur ce n-ai scris. Declarația AI e oricum cerută la predare.

### 0.3 „Educațional”: e cerut?

Din ce pot verifica: **nu**. Descrierea ta inițială a proiectului („tool web public: introduci RA/Dec → vezi cutout-uri din epoci diferite, blink, ca să prinzi obiectele care se mișcă”) și rezumatul pe care l-au citat răspunsurile AI („unealtă publică care ajută oamenii să vizualizeze cum se schimbă obiectele pe cer în timp”) vorbesc despre *vizualizare și descoperire*, nu despre educație. **Nu am putut deschide eu pagina provocării** (eroare de certificat pe rețeaua ta), deci confirmă tu textul exact.

Totuși „public-facing” înseamnă că o persoană fără pregătire trebuie să poată folosi unealta. Soluția: **descoperire în față, ghidare minimă**: un tur de 5 pași, etichete clare, popover-uri de glosar, **fără lecții în aplicație** (lecțiile rămân în documentație).

---

### 0.4 Referințele tale, analizate (am citit paginile)

| Referință | Ce spui tu | Ce am găsit (verificat) | Lecție pentru noi |
|---|---|---|---|
| [Backyard Worlds: Planet 9](https://www.zooniverse.org/projects/marckuchner/backyard-worlds-planet-9) (Zooniverse) | Îți place **paleta** și secțiunea **About**; nu-ți place că **nu poți face nimic cu pozele** | Pagină de proiect cu file *About / Classify / Talk / Collect*; sarcina: voluntarii compară imagini WISE cu ochiul ca să deosebească obiecte în mișcare de artefacte | Un **About** scurt și clar care dă contextul științific; dar noi trebuie să fim **interactivi**: să te poți „juca” cu imaginile |
| [WiseView](https://blog.backyardworlds.org/2017/09/13/wiseview/) | **Look prea simplu**, alb pe negru | Unealtă făcută de voluntari: cutout WISE clipind **deasupra unui compozit color PanSTARRS** (context), selector de epoci, **câmp de vedere**, **zoom**, **bandă** (W1 / W2 / ambele), **viteză**, parametru **„linear”** (asinh) și **„trim bright”** (fix / procent / adaptiv), **hartă de culoare**. Nu are suprapuneri de catalog | Exact „jocul cu luminile” pe care îl vrei: **glisoare de stretch și de tăiere a luminii**. Plus ideea **benzii de context** (aceeași zonă într-un alt survey sub imaginea care clipește) |
| [Legacy Surveys Sky Viewer](https://a.legacysurvey.org/svtips/) | **Prea simplu** | **Salt la obiect aleatoriu**; introducere de coordonate; comutare între straturi cu **bara de spațiu**; **blink** prin parametru de URL; **„Link here”** care reproduce poziția, zoomul, stratul; marcaje și poligoane din URL; **încărcare de catalog propriu (CSV / FITS)**; cutout-uri JPEG sau FITS | URL-uri care păstrează starea (avem deja), **bara de spațiu** ca flip rapid, **încărcare de coordonate proprii** ca marcaje, buton **„Random target”** |

**Concluzie de produs:** vrei ceva mai **atmosferic și mai jucăuș** decât aceste unelte, dar **tot precis**. Atmosfera vine din culoare, ierarhie, adâncime și detalii de interfață; nu din decor.

### 0.4b Paleta aplicată (7 nov): derivată din poza din header

Decizia ta: paleta site-ului se potrivește cu poza și cu headerul (cea de mai jos înlocuiește opțiunile A/B/C de după). Culorile vin din **pixelii pozei** (analiză automată) și din ideile din articolul Visme (schema pe trei culori: una principală, una complementară de fundal, una de accent; 3–5 culori).

| Rol | Culoare | Origine / verificare |
|---|---|---|
| Fundal | `#0C110D` | tentă verde-neagră medie a pozei |
| Panou / ridicat / câmp | `#172019` / `#1E2A22` / `#101712` | trepte ale aceleiași nuanțe |
| Text / secundar | `#DDEBDF` (15,5:1) / `#98AA9D` (6,8:1 pe panou) | contrast calculat |
| Accent (umpleri, butoane) | **`#54A66B`** (verde din poză); hover `#8FC277` | text închis pe el 6,4:1; ca text pe fundal 6,4:1 |
| Accent 2 (aur) | **`#D9BE5A`** | aurul din nebuloasă; buton „Start exploring” 10,4:1 |
| Strălucire | `#C4EDCE` | mintul din centrul nebuloasei |

- Graficele (`measure.js`) folosesc fundalul `#121913`; paleta pe detectoare a fost **revalidată** pe el (toate verificările trec).
- Culorile de **date** din imagine (portocaliu / albastru la Difference, verde la poziția prezisă, galben la apertură) rămân neschimbate.
- Imaginea din header și fundalul paginii sunt **generate de noi** (`scratch/make_nebula.py`, 2560×1440: gaz cu zgomot fractal cu deformare dublă, filamente aurii, stele ascuțite cu raze); culorile au fost eșantionate din poza de referință, **fără pixeli din ea** (poza venea dintr-un clip stock Getty, deci nu putea fi publicată). Fundalul paginii (`bg-nebula.jpg`) e întunecat în trepte, iar panourile sunt ușor transparente.

### 0.5 Paleta: trei opțiuni (am afișat mai sus o machetă mică pentru fiecare)

| Opțiune | Origine | Verdict |
|---|---|---|
| **A. Midnight instrument** | Paleta ta (`#141619`, `#2C2E3A`, `#050A44`, `#0A21C0`, `#B3B4BD`) + **mint `#D1E8E2`** și **peach `#FFCB9A`** din prima referință | **Recomandată.** Păstrează ce ai ales; peach-ul cald contrastează cu albastrul rece și leagă designul de tema „infraroșu = căldură”. Contraste: text pe fundal 8,8:1; peach 12,3:1; mint pe albastru 8,2:1 |
| **B. Teal observatory** | Prima referință (Sirin Labs): `#2C3531`, `#116466`, `#D9B08C`, `#FFCB9A`, `#D1E8E2` + un fundal închis derivat de mine (`#0B1415`) | Cel mai „atmosferic”. Atenție: peach-ul e **prea aproape de portocaliul din Difference** (1,4:1) și teal-ul pe fundal are doar 2,7:1 (doar ca umplere). Ar cere schimbarea culorilor de date |
| **C. Graphite + lime** | A doua referință (`#222629`, `#474B4F`, `#6B6E70`, `#86C232`) | **Nu recomand:** verdele lime se bate cu markerii verzi, iar gri `#474B4F` (1,7:1) și `#6B6E70` (3,0:1) **nu trec** ca text. Poate fi luat doar ideea indexului vertical |

A treia imagine (SFCD) are un fundal foarte închis cu accente pastel (nisip, mov, verde); le păstrăm ca idee de **accente rare**, nu ca paletă.

**Regulă:** culorile **de date** (portocaliu / albastru deschis la Difference, verde-mint la poziția prezisă, galben la apertură, roșu la flag-uri) rămân **distincte** de accentele interfeței și se **revalidează** pe fundalul ales.

### 0.6 Tehnici de „atmosferă” luate din referințe (cu grijă la calm și accesibilitate)

1. **Cadru HUD** cu colțuri în jurul vizualizatorului (Sirin Labs); SVG / CSS simplu, ieftin.
2. **Etichete mici cu spațiere între litere** pentru secțiuni; minimum 12 px, contrast verificat.
3. **Linii fine de 1 px** în loc de cutii și carduri.
4. **Fundal de cer** foarte discret (puncte / zgomot, ≤ 4% opacitate), **niciodată în spatele imaginii**; fără animații, oprit la `prefers-reduced-motion`.
5. **Strălucire (glow)** doar pe elementul activ, foarte redusă; verificat să nu strice contrastul textului.
6. **Index vertical 01–05** pe margine (reputationsquad), legat de fluxul de lucru: 01 Target · 02 Blink · 03 Measure · 04 Candidates · 05 Context. Clar și pentru recrutori.
7. **Butonul „Discover / Try the demo”** cu colțuri tip paranteză (ca la Sirin).
8. **Bară de unelte compactă** în colț (partajare, grafic, reticul), ca la Sirin.
9. **Tipografie:** text neutru (Inter sau IBM Plex Sans), **cifre tabulare** pentru coordonate, titluri cu spațiere sau condensat (ex. un font condensat precum cel din a doua referință). Se verifică fonturile alese pe încărcare (fallback).
10. **De evitat** (skill-ul de design): gradient violet, forme decorative, carduri în carduri, hero uriaș fără conținut.

### 0.7 „Să mă pot juca cu pozele”: Playground de imagine (prioritate **M**)

Un panou de control cu **efect imediat**, inspirat de WiseView, dar mai bogat:
- **Punct negru / punct alb**, **gamma / „linear”** (asinh), **„trim bright”** (procent / valoare fixă), **contrast**, **inversare**;
- **hărți de culoare** (gri, inferno, viridis, magma — sigure pentru daltoniști);
- **cross-fade** între două epoci (glisor de amestec) și **„ține apăsat ca să vezi referința”** (A/B);
- **câștig pentru Difference** (cât de tare amplificăm schimbările);
- **histogramă** a valorilor cu mânere pentru punctele negru / alb;
- **presetări**: „Faint sources”, „Bright stars”, „Moving objects”, „Reset”;
- **bandă de context** sub imagine: aceeași zonă în 2MASS / AllWISE (ca PanSTARRS la WiseView);
- scurtături: **Space** = flip rapid între cadre / straturi.

**Cerință de date:** pentru asta frontend-ul are nevoie de **valori numerice**, nu de PNG: vezi „Contract v2” din [BACKEND_INTEGRATION.md](BACKEND_INTEGRATION.md). Un cutout de 49×49 are ~10 KB, deci e posibil.

---

## 1. Direcția de design

| Întrebare | Răspuns propus (de confirmat cu tine) |
|---|---|
| **Scop** | Să găsești rapid obiecte care se mișcă pe cer și să înțelegi *de ce* sunt speciale. |
| **Public** | (1) **jurații**: văd proiectul 1–3 minute, trebuie să înțeleagă imediat; (2) elevi / studenți / astronomi amatori; (3) cercetători: vor control și date. Primar: **jurații**; secundar: învățare. |
| **Ton** | „Consolă de observator”: tehnic, calm, precis, dens unde trebuie. Nu „aplicație de startup”. |
| **Detaliu memorabil** | **Placa Epocă × Lungime de undă**: un mic grafic sub imagine cu data pe orizontală (scală reală de timp) și lungimea de undă *la poziția țintei* pe verticală; fiecare cadru e un punct, trecerile formează grupuri, cadrul curent e evidențiat, click = salt la cadru, selecție de cadre cu lungimi de undă apropiate = „blink de aceeași culoare”. Arată ce e unic la SPHEREx (timp + spectru) și previne capcana filtrului variabil (lecție, secț. 7). |
| **Al doilea detaliu** | **Compozit RGB pe epoci**: 3 epoci → canalele R, G, B. Obiectele fixe ies albe; cele mutate ies colorate (un punct roșu + unul verde + unul albastru). Clasic, ieftin și spectaculos pentru video. |
| **Constrângeri** | Vanilla JS, fără build; CDN la cerere; telefon + desktop; WCAG 2.2 AA; funcționează pe rețea slabă; ușor de înregistrat în video. |

### Critică sinceră a UI-ului actual (față de anti-pattern-urile din skill)
- **Gradient cian→violet peste tot** (titlu, butoane, slider-e, chip-uri active): aspect generic. Propunere: o singură culoare de accent + culori **rezervate pentru date** (portocaliu/albastru = diferență, verde = poziție prezisă, galben = apertură, roșu = flag-uri).
- **Imaginea nu e eroul:** ocupă ~640 px într-o coloană, iar jumătate din ecran e formular și text. Propunere: imaginea ocupă cât mai mult; controalele stau în bare lângă ea.
- **Pagină de secțiuni numerotate (1–4)** în loc de un spațiu de lucru; la o unealtă folosită repetat e mai bun un singur ecran cu panou lateral („inspector”).
- **Interfața se explică singură** (liste „How to…”, paragrafe sub moduri). Propunere: etichete scurte + explicații la cerere (popover, tur ghidat).
- **Carduri în carduri** (hint în panou, grafice în panou). Propunere: suprafețe plate separate prin linii subțiri.
- **Ce merge bine și păstrăm:** primul ecran e unealta, nu o pagină de prezentare; stări de încărcare/eroare; ARIA; URL-uri partajabile; tastatură.

---

## 2. Fluxul-erou (testul „30 de secunde”)

> Deschizi pagina → apeși **„Try the demo: WISE 0855”** → vezi cum un punct se mută (Difference: portocaliu lângă albastru, tick-uri verzi pe poziția prezisă) → dai click pe el → vezi spectrul care crește spre 5 µm → înțelegi de ce e special.

Tot restul trebuie să nu încurce acest flux. **Criteriu de succes:** o persoană care n-a mai văzut aplicația îl parcurge în < 30 s fără instrucțiuni (test cu 3–5 oameni, vezi secț. 8).

Alte fluxuri:
- **Explorare liberă:** caută un obiect după nume sau coordonate → blink → măsori.
- **Candidați:** „Find movers” → listă clasată → click = deschide în vizualizator → marchezi „cunoscut / interesant / artefact”.
- **Învățare:** „Explain this view” → explicații în limbaj simplu, cu glosar.
- **Prezentare/video:** mod „Presenter” cu subtitrări automate și pași scriși.

---

## 3. Structura ecranului

```
┌ Bara de sus: [Caută țintă ▾] [RA] [Dec] [FOV] [Detector]  [Load]      [Date: REALE|MOCK] [?] [Share] ┐
├────────────────────────────────────────────┬──────────────────────────────┤
│                                            │ INSPECTOR (file)             │
│   VIZUALIZATOR (canvas, pan/zoom)          │  • Sursă (după click)        │
│   bară de unelte peste imagine:            │  • Spectru                   │
│   moduri · suprapuneri · stretch · loupe   │  • Curbă de lumină           │
│   busolă N/E · scară · cursor: RA/Dec/λ    │  • Candidați                 │
│                                            │  • Info & proveniență        │
├────────────────────────────────────────────┴──────────────────────────────┤
│ Placa Epocă × Lungime de undă   ▸ ⏮ ⏭  viteză  [cadru 3/8 · 2025-11-06]   │
└────────────────────────────────────────────────────────────────────────────┘
```
Telefon: vizualizator sus; rând de transport; **bottom sheet** cu file (Sursă / Spectru / Info); placa Epocă × λ se micșorează la un rând. Un singur flux vertical, fără scroll orizontal.

Reguli: **cel mult ~12 controale vizibile pe primul ecran**; restul în meniuri/panouri („progressive disclosure”); fără carduri în carduri.

---

## 4. Inventar de butoane și utilități (MoSCoW)

Legendă: **M** = obligatoriu pentru v2 · **S** = ar trebui · **C** = dacă rămâne timp. „De ce” = cum ajută la scopul proiectului.

### A. Căutare țintă
| Utilitate | Pr. | De ce |
|---|---|---|
| **Căutare după nume** („WISE 0855”, „Barnard”) cu rezolvare prin SIMBAD (Harvard TAP merge cu CORS) | S | Mai natural decât coordonate; impresionează în demo |
| Lipește coordonate în orice format (deja avem parser) | M | Flexibilitate |
| **„Try the demo”** + exemple (mover, variabilă, artefact) | M | Fluxul-erou |
| Recente / favorite (localStorage) | S | Reluare rapidă |
| „Surprise me”: obiect test aleatoriu | C | Explorare |
| Selector FOV (slider + valori rapide 1′/5′/15′/30′) | M | Control simplu |

### B. Redare și timp
| Utilitate | Pr. | De ce |
|---|---|---|
| Play/pauză, pas înainte/înapoi, viteză, buclă / ping-pong | M | Blink |
| **Placa Epocă × λ** (selecție prin tragere) | M | Detaliul memorabil; evită capcana LVF |
| Timeline cu **scară reală de timp** (nu pași egali) | S | Pauzele de 6 luni se văd ca atare |
| Salt la trecerea următoare / precedentă | S | Navigare rapidă |
| „Doar cadre cu λ similare” (filtru) | S | Validitate științifică |

### C. Moduri de comparare
| Mod | Pr. | De ce |
|---|---|---|
| Blink, Difference, Stack, Trail (existente) | M | Deja validate |
| **Compozit RGB pe epoci** | M | Vizual, simplu |
| **Swipe / glisor de comparare** între 2 cadre | S | Comparare directă, familiar |
| **Alăturat** (2–4 panouri sincronizate la pan/zoom) | S | Compari detectoare sau epoci |
| Flicker rapid între 2 cadre alese | C | Tradiția blink comparator |

### D. Unelte de imagine
| Utilitate | Pr. | De ce |
|---|---|---|
| **Pan/zoom** (roată, tragere, ciupire pe mobil; taste +/-) | M | Imaginile au doar ~48 px |
| **Cititor la cursor**: RA/Dec, pixel x,y, valoare, **λ la acel pixel** | M | Face datele „palpabile” |
| Controale de **stretch**: punct negru/alb, gamma; presetări liniar / log / asinh / zscale | S | Obiecte slabe vizibile |
| Hărți de culoare (gri, inferno, viridis — sigure pentru daltoniști), invers | S | Preferințe, accesibilitate |
| Lupă (loupe) pe pixeli | S | Verificare sub-pixel |
| Busolă N/E + **bară de scară** (″ / ′) | S | Orientare, rigurozitate |
| Grilă RA/Dec, grilă de pixeli | C | Pentru profesioniști |
| Netezire on/off (pixeli vs interpolat) | C | Gust |
| Fullscreen, „Resetează vederea” | M | Utilitate de bază |

### E. Suprapuneri (cu legendă și comutatoare)
| Suprapunere | Pr. |
|---|---|
| Poziție prezisă (verde), flag-uri (roșu), apertură (galben) | M (există) |
| Surse SIMBAD pe imagine (cunoscut vs necunoscut) | S |
| Candidați (cercuri numerotate) | S |
| Opacitate pe fiecare strat | C |

### F. Măsurare și analiză
| Utilitate | Pr. | De ce |
|---|---|---|
| Click → spectru + curbă de lumină + tabel (există) | M | Cerință-bonus |
| **Spectrul cu benzile detectoarelor colorate** + mark-uri pentru H₂O / CO₂ / CO | S | Educativ, impresionant |
| Compară 2 poziții (țintă vs „fundal” / altă sursă) | S | Distinge variabila de artefact |
| Raza aperturii reglabilă + vizualizarea inelului de fundal | S | Transparență |
| **Panou „Candidați”**: listă clasată, viteză (″/an), direcție, scor, acțiuni (cunoscut / interesant / artefact) | S | „Find movers” |
| Export CSV / VOTable | S | Utilitate pentru oameni de știință |
| Adnotări (etichetă + notiță pe o sursă) | C | Lucru colaborativ |

### G. Încredere și proveniență
| Utilitate | Pr. | De ce |
|---|---|---|
| **Insignă clară REALE / MOCK / FIȘIERE SINTETICE**, mereu vizibilă | M | Cerința de onestitate; criteriul Validity |
| Sertar „Despre aceste imagini”: ID fișier, MJD, detector, λ-interval, versiune procesare, link IRSA | M | Reproductibilitate |
| Indicatori de calitate (fracție pixeli buni, zgomot) | S | Încredere |
| Mesaje de eroare specifice + „Try again” (există) | M | Fiabilitate |

### H. Învățare și ghidare
| Utilitate | Pr. | De ce |
|---|---|---|
| **Tur ghidat** (5–7 pași, legende, poate fi sărit) | M | Primul contact al juriului |
| Popover-uri de glosar pe termeni (MJD, flux, λ, detector) | S | Fără jargon |
| „Explain this view” (ce văd acum?) | S | Educație |
| Foaie de comenzi rapide (`?`) | S | Utilitate |
| Studii de caz (mover / variabilă / artefact) | S | Înțelegerea diferenței |

### I. Partajare și export
| Utilitate | Pr. |
|---|---|
| Copiază link (există), PNG (există), video WebM (există) | M |
| GIF animat (pentru README) | S |
| **Raport** (pagină de tipărit/PDF: imagini + spectru + coordonate + surse) | S |
| Cod de **embed** (iframe `?embed=1`), cod QR | C |
| Text de citare / credite (copiabil) | S |

### J. Sistem
| Utilitate | Pr. |
|---|---|
| Setări: temă (închisă / deschisă / contrast mare), reducere mișcare, unități (″ / px), format coordonate (grade / sexagesimal) | S |
| Persistență locală (ultima vedere, preferințe) | S |
| Offline / PWA (cache pentru ultimele rezultate; util cu Wi-Fi slab la eveniment) | C |
| Limbă EN (obligatoriu) + RO (opțional) | C |
| **Mod „Presenter”** (ascunde bara, text mare, legende de pași) pentru video | S |

**Buget de funcții:** nu toate. Un proiect „top” are **un flux-erou impecabil** și 3–4 detalii memorabile, nu 40 de butoane. Propunere de v2: toate **M**, apoi **S** în ordinea: stretch+pan/zoom → cititor la cursor → căutare după nume → candidați → swipe/alăturat → raport.

---

## 5. Metode de design pe care le aplicăm (și cum)

| Metodă | Aplicare aici |
|---|---|
| **Jobs-to-be-done** | „Când caut obiecte în mișcare, vreau să văd rapid ce s-a schimbat, ca să decid dacă merită investigat.” |
| **Persone** | Jurat grăbit · Elev curios · Astronom amator · Cercetător |
| **Arhitectura informației + fluxuri** | Flux-erou și 3 fluxuri secundare (secț. 2); un singur ecran de lucru |
| **Progressive disclosure** | Primul ecran minimal; detalii în file, meniuri, popover-uri |
| **Design tokens** | Variabile CSS pentru culori, spațiere, raze, umbre, timpi de mișcare; teme (închis / deschis / contrast mare) din aceleași variabile |
| **Sistem de culori semantic** | Culori rezervate pentru date; paletă pentru daltoniști validată cu scriptul din skill-ul `dataviz` (deja folosit la grafice) |
| **Tipografie** | O familie pentru text, cifre **tabulare** pentru coordonate / valori (ca să nu „danseze”), monospace opțional pentru cititorul de cursor |
| **Grilă și responsive** | Container queries + zone stabile (vizualizatorul își păstrează raportul de aspect; barele nu își schimbă înălțimea când apar etichete) |
| **Micro-interacțiuni și mișcare** | Mișcare doar ca să clarifice starea (≤ 200 ms); respectă `prefers-reduced-motion`; fără animații decorative |
| **Stări (loading / empty / error / partial / success / permission)** | Tabelul din secț. 6, completat pentru fiecare ecran |
| **Conținut / micro-copy** | Engleză simplă, verbe active, fără jargon fără explicație; termeni cu popover |
| **Accesibilitate WCAG 2.2 AA** | Focus vizibil, țintă ≥ 24 px, contrast, cuvinte-cheie ARIA; **canvas** cu text alternativ dinamic, echivalente de tastatură pentru click și pan/zoom, anunțuri `aria-live` pentru schimbări |
| **Performanță** | Bugete: fără salturi de layout, desenare doar la schimbare, Web Worker pentru Difference/Stack dacă e nevoie, imagini decodate o singură dată |
| **Vizualizare de date** | Principiile din skill-ul `dataviz`: o singură axă, direct-labeling, tooltip la hover, tabel alternativ |
| **Prezentare / video** | Mod Presenter, tur scris, scenarii repetabile |

---

## 6. Stări (după skill-ul de design)

| Stare | Ce afișăm | Următoarea acțiune sigură |
|---|---|---|
| **Încărcare** | Structură stabilă + progres „3/8 imagini”; scheletul vizualizatorului | Anulare |
| **Gol** | „Nu există imagini SPHEREx aici” + sugestii (alt detector, alt FOV, o țintă de test) | Butoane de sugestii |
| **Eroare** | Cauza specifică (server căzut / timeout / format) | „Încearcă din nou”, „Folosește datele demo” |
| **Parțial** | Ce există + ce lipsește marcat (ex. „2 din 3 cadre; flag-uri indisponibile”) | Continuă cu ce e disponibil |
| **Succes** | Confirmare discretă (ex. „Link copiat ✓”) | Următorul pas sugerat |
| **Permisiuni / rețea** | Explicație (Clipboard, Record, WebGL absente) | Alternativă (prompt de copiere, descărcare) |

---

## 7. Ținte tehnice pentru frontend v2

- **Viewporturi de test:** 375×812, 768×1024, 1440×900.
- **Contrast** ≥ 4,5:1 pentru text; ≥ 3:1 pentru elemente grafice.
- **Fără scroll orizontal**, țintă tactilă ≥ 24 px (recomandat 44 px).
- **Performanță:** interacțiune fluidă la 8–12 cadre; fără blocarea firului principal > 50 ms la schimbarea modului; imaginile se decodează o dată.
- **Rezistență la rețea slabă:** mesaje clare, încercări repetate, cache.
- **Date mari reale:** niciodată imaginea întreagă în browser; doar cutout-uri (vezi [BACKEND_INTEGRATION.md](BACKEND_INTEGRATION.md)).

---

## 8. Cum verificăm (poartă de finalizare pe randare reală)

Skill-ul cere **dovezi de pe interfața randată**, nu doar din cod:
1. Contract scris: scopul, acțiunea principală, ierarhia, viewporturile, observațiile.
2. Captură de ecran pentru **fiecare viewport** și fiecare stare (încărcare, gol, eroare, parțial, succes, permisiuni); salvate în `docs/evidence/`.
3. Verificări: tastatură (Tab, Space, săgeți, Esc), focus vizibil, etichete, contrast, mișcare redusă, ținte tactile, conținut lung.
4. **Lighthouse** (accesibilitate + performanță) cu uneltele chrome-devtools adăugate.
5. **Test cu oameni:** 3–5 persoane, sarcină: „găsește obiectul care se mișcă în WISE 0855 în sub un minut” + test de 5 secunde („ce face pagina asta?”).
6. Înregistrare JSON de dovezi + scriptul verificator din skill (`check-evidence.js`), cu observații reale.

---

## 9. Întrebări pentru tine (răspunde scurt; vor decide designul)

1. **Cine e publicul principal?** Jurații (impresie rapidă) sau elevi/studenți (învățare)? (Propun: jurații primul, învățarea ca bonus.)
2. **Ton:** „consolă de observator” (tehnic, sobru) sau „prietenos / educațional” (mai colorat)?
3. **Limbă:** doar engleză, sau engleză + română?
4. **Accent:** „descoperire” (candidați, Find movers) sau „educație” (ghid, explicații)? Sau ambele, în ce proporție?
5. **Temă deschisă** necesară, sau doar închisă (cer / noapte)?
6. **Nume și identitate:** păstrăm „SPHEREx Blink”? Ai idei de logo sau culoare de accent?
7. **Videoclipul** e demo-ul principal? (Dacă da, modul Presenter devine prioritar.)
8. **Referințe:** 3–5 site-uri/aplicații care îți plac (Aladin, WorldWide Telescope, Zooniverse, Stellarium Web, altele) și ce îți place la fiecare.
9. **Dispozitivul** pe care îl vor folosi probabil jurații: laptop, telefon, proiector?
10. **Ce nu vrei** să vezi în aplicație?

---

## 10. Ordinea propusă pentru v2 (după clarificarea regulii)

1. Contract de design + machete (hârtie sau HTML static) validate cu tine.
2. Schelet de layout (bară de sus, vizualizator, inspector, placă Epocă × λ) pe date mock.
3. Fluxul-erou complet (tur, demo, Difference, poziție prezisă, click → spectru).
4. Unelte de imagine (pan/zoom, cursor, stretch), apoi RGB și swipe.
5. Candidați + căutare după nume.
6. Stări, accesibilitate, performanță, poarta de randare.
7. Mod Presenter, README cu GIF, video.

---

## 11. „Find movers” – design (axa proiectului; fără cod)

**Scop:** dat un câmp și ≥ 2 treceri, listăm **candidați** de obiecte în mișcare, cu încredere și vector de mișcare, apoi clasificăm (cunoscut / posibil cunoscut / necunoscut). Folosim cuvântul **„candidat”**, niciodată „descoperire”.

**Pașii algoritmului** (început simplu, geometric; fără rețele neuronale):
1. **Pregătire:** grupăm cadrele pe detector și pe **treceri** (pauză > 30 de zile); stack pe trecere pentru mai puțin zgomot; ținem cont de **lungimea de undă** (capcana LVF: comparăm benzi apropiate sau marcăm diferența).
2. **Diferențe între treceri** (trecere i − trecere j), cu zgomot estimat robust (MAD).
3. **Detecție:** maxime locale peste k·σ (k ≈ 5) cu formă de PSF, atât pozitive, cât și negative; perechile **pozitiv + negativ** (dipol) sugerează o mutare.
4. **Asociere:** potrivim detecțiile între treceri într-o rază maximă configurabilă (de la sub-pixel până la zeci de pixeli, pentru obiecte îndepărtate cu paralaxă mare) și ajustăm o mișcare liniară (sau cu paralaxă, pe baze lungi).
5. **Respingere:** doar într-o trecere; pe pixeli cu flag; în halo-ul unei stele luminoase; formă alungită (rază cosmică); stă pe loc dar variază (⇒ clasa „variabilă”).
6. **Scor:** SNR, număr de detecții, consistența mișcării (χ²), fracție de flag-uri.
7. **Potrivire cu SIMBAD** (cu mișcare proprie): cunoscut / posibil cunoscut / necunoscut. **Un candidat necunoscut nu e automat un obiect nou**: poate fi un artefact sau un obiect necatalogat banal.
8. **Rezultat:** poziție la epoca de referință, vector (″/an, unghi de poziție), SNR, banda folosită, flag-uri, clasă, miniaturi; export CSV.

**Validare (esențială pentru „Validity” și pentru CV):**
- **Injectare–recuperare:** punem mover-i sintetici (viteze 0,3–100 px/an, fluxuri variate) în cadre reale sau false; măsurăm rata de recuperare și fals-pozitivele.
- **Obiecte cunoscute:** Barnard's Star, Epsilon Indi B, WISE 0855 trebuie recuperate cu vectorul așteptat.
- **Câmp gol:** rulăm pe poziții aleatorii și raportăm rata de fals-pozitive.
- Documentăm limitele (ce viteze și ce luminozități nu detectăm).

**Interfață:** panou „Candidates” cu listă, miniaturi și scor; click ⇒ centrează și evidențiază în vizualizator; acțiuni „cunoscut / interesant / artefact”; reglaje (sensibilitate, viteză maximă); **„Why this candidate?”** (dovezi: detecții, viteză, SNR, bandă). Calculul poate rula în browser (Web Worker) pentru cutout-uri mici și în backend pentru câmpuri mari.
