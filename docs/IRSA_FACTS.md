# Fapte verificate din documentația IRSA / SPHEREx (6 nov 2026)

Aceasta e **sursa de adevăr** pentru accesul la date și structura fișierelor. Înlocuiește presupunerile din `DATA_CHECKLIST.md`, `BACKEND_INTEGRATION.md` și lecție.
Cum am verificat: am citit paginile de mai jos prin instrumentul de web al sesiunii. Nu am rulat încă nimic pe date reale. Unde o pagină a fost neclară, am scris „neclar”.

**Avertismente:**
- Tutorialele spun că numele colecțiilor și ale tabelelor **se schimbă între lansări de date** (un demo menționează valabilitate „februarie 2026”). Re-verifică înainte de predare.
- Datele au fost ingerate săptămânal; SIA2 întârzie ~1 zi, TAP nu.

## Surse

- [SPHEREx Data Access (arhiva IRSA)](https://caltech-ipac.github.io/spherex-archive-documentation/spherex-data-access/)
- [SPHEREx Cutout Tool](https://irsa.ipac.caltech.edu/data/SPHEREx/docs/cutout_tool.html)
- [Parametrii cutout IBE](https://irsa.ipac.caltech.edu/ibe/cutouts.html)
- [Tutorial: Introduction to SPHEREx Spectral Images](https://caltech-ipac.github.io/irsa-tutorials/spherex-intro/)
- [Tutorial: Download a collection of SPHEREx cutouts](https://caltech-ipac.github.io/irsa-tutorials/spherex-cutouts/)
- [Tutorial: ePSF în cutout](https://caltech-ipac.github.io/irsa-tutorials/spherex-psf/)
- [Pagina misiunii: Survey](https://spherex.caltech.edu/page/survey) (și lucrări citate: [misiunea](https://arxiv.org/pdf/2511.02985), [răspunsul spectral](https://arxiv.org/pdf/2602.09139))

## 1. Structura unui fișier „spectral image” (nivel 2, MEF)

| HDU | Nume | Tip / dimensiune | Conținut |
|---|---|---|---|
| 0 | PRIMARY | fără date, 5 cărți | metadate (ex. `VERSION`) |
| **1** | **IMAGE** | 2040×2040 float32 | flux calibrat, **MJy/sr**, **fără scădere a zodiacalului** |
| **2** | **FLAGS** | 2040×2040 int32 | hartă de biți pe pixel |
| 3 | **VARIANCE** | 2040×2040 float32 | varianță, MJy²/sr² |
| 4 | **ZODI** | 2040×2040 float32 | model de fundal zodiacal (nescăzut) |
| 5 | PSF | 101×101×121 float32 | 121 PSF-uri supraeșantionate pe o grilă 11×11 |
| 6 | **WCS-WAVE** | tabel, 1 rând | `X` (11), `Y` (11), `VALUES` (2×11×11) |

- **Presupunerea noastră „IMAGE în HDU 1, FLAGS în HDU 2” e CONFIRMATĂ.**
- Cuvinte-cheie văzute: `DATE` (ex. `2025-10-27T03:18:58.374`), `DETECTOR` (număr, ex. `2`), `BUNIT` ("MJy / sr"), `PSF_FWHM` (ex. 5,15), `WCSNAMEA` (pixeli activi, 0-based), `WCSNAMEW` ("per-pixel wavelength and bandwidth").
- **Nu am văzut un cuvânt-cheie MJD** în exemplele din documentație. Atenție: `DATE` poate fi data creării fișierului, nu a observației; **neclar**. Pentru timpul observației, tutorialul folosește **tabelul TAP** (`time_bounds_lower`).
- **Scara pixelilor:** documentația menționează „0,615″” într-un context cu PSF supraeșantionat ×10; împreună cu sursele misiunii („pixeli de 6,15″”) rezultă **6,15″/pixel** pentru imaginea originală [inferența mea, consecventă cu sursele misiunii]. Un detector acoperă ~3,5°.

## 2. Lungimea de undă (confirmă lecția, secțiunea 7)

- Lungimea de undă **variază pe detector** și e dată de **WCS-WAVE**: o grilă 11×11 de puncte de control (X, Y ∈ {1, 205, 409, 613, 817, 1021, 1224, 1428, 1632, 1836, 2040}), fiecare cu **lungime de undă centrală** și **lățime de bandă**.
- Calcul (din tutorial): `WCS(header=hdul["IMAGE"].header, fobj=hdul, key="W")`, apoi `wcs.sip = None`, apoi `pixel_to_world(x, y)` ⇒ `(wavelength, bandwidth)`.
- Exemplu: detectorul 2, centrul imaginii: 1,337 µm, lățime 0,032 µm.
- Cadrul tău primește deci **o lungime de undă la poziția țintei** (nu una pe fișier).

## 3. Cele 6 benzi / detectoare

- 6 matrice 2K×2K (Hawaii-2RG), fiecare cu propriul LVF; **perechi observate simultan: (1,4), (2,5), (3,6)** [confirmă presupunerea noastră].
- Intervale: D1–D3 împreună 0,75–2,42 µm (R≈41); D4 2,42–3,82 (R≈35); D5 3,82–4,42 (R≈110); D6 4,42–5,00 (R≈130). Sursele diferă ușor la R pentru D6 (125 vs 130). Documentația spune **D2 = 1,10–1,62 µm** [confirmă tabelul din mock].
- 17 canale pe bandă ⇒ 102 canale.
- Câmp instantaneu ~3,5° × 11,3°, pixel 6,15″.

## 4. Strategia de observare (important pentru blink)

- **4 hărți ale întregului cer în ~2 ani**; fiecare punct de pe ecliptică e văzut **cel puțin de 4 ori**; **câmpuri adânci** (~200 de grade pătrate) lângă polii eclipticii, cu **mult mai multe** observații.
- Trecerile alternate sunt **decalate cu o jumătate de canal** (eșantionare Nyquist): lungimea de undă a aceluiași pixel diferă puțin de la o trecere la alta ⇒ un motiv în plus să afișăm λ la poziția țintei.
- Survey-ul a început după verificarea în orbită (în jur de 1 mai 2025) [din surse secundare].

## 5. Steaguri (FLAGS) – definiții din documentație

| Bit | Semnificație | Propunere |
|---|---|---|
| 0 | Tranzient (în timpul SUR) | **rău** |
| 1 | Overflow | **rău** |
| 2 | Eroare SUR | **rău** |
| 4 | Pixel fantomă | **rău** |
| 5 | Pixel de referință | rău / ignorat |
| 6 | Permanent inutilizabil | **rău** |
| 7 | Eficiență mică (dichroic) | de decis |
| 9 | Date pierdute la bord | **rău** |
| 10 | Pixel fierbinte | **rău** |
| 11 | Semnal anormal de mic (rece) | **rău** |
| **12** | Istoric complet de eșantioane disponibil | **informativ** |
| 14 | Corecția fantomă nu s-a aplicat | de decis |
| 15 | Corecția de neliniaritate nesigură | de decis |
| 17 | Sarcină persistentă peste prag | de decis |
| 19 | Valoare aberantă (outlier) | de decis; **atenție la obiecte în mișcare** |
| **21** | **Asociat cu o sursă cunoscută** | **informativ, nu „rău”** |

**Concluzie critică:** regula noastră actuală „orice bit ≠ 0 = marcat” e **greșită** pentru datele reale: biții 12 și 21 sunt informativi (bitul 21 ar marca *pixelii stelelor cunoscute*, deci ar colora în roșu toate stelele). Trebuie o **mască de biți „răi”** configurabilă. Rămâne de decis pentru biții marcați „de decis”.

## 6. Cum accesăm datele

| Metodă | Detalii confirmate |
|---|---|
| **Directoare navigabile** | `https://irsa.ipac.caltech.edu/ibe/data/spherex/` cu `qr2/`, `qr3/`; oglindite pe AWS |
| **SIA2** | `https://irsa.ipac.caltech.edu/SIA?COLLECTION=<nume>&POS=circle+<ra>+<dec>+<raza>&RESPONSEFORMAT=...`; coloane `access_url` (local) și `cloud_access`; colecții: `spherex_qr3`, `spherex_qr3_deep`, `spherex_qr2`, `spherex_qr2_deep` (**Wide** = acoperire uniformă, **Deep** = câmpuri adânci) |
| **TAP** | prin `astroquery.ipac.irsa.Irsa.query_tap`; tabele **`spherex.plane`** (`planeid`, `time_bounds_lower`, `poly`, `energy_bandpassname`) și **`spherex.artifact`** (`uri`, `planeid`); căutare: `1 = CONTAINS(POINT('ICRS', ra, dec), p.poly)` și `p.energy_bandpassname = 'SPHEREx-D2'` (nume `SPHEREx-D<n>`); sortare după `p.time_bounds_lower` |
| **Cutout server-side** | se adaugă la URL-ul fișierului: `...fits?center=<ra>,<dec>[unitate]&size=<x[,y]>[unitate]` |
| **Python** | `pyvo`, `astroquery` |
| **Data Explorer (GUI)** | `https://irsa.ipac.caltech.edu/applications/spherex` |

### Parametrii serviciului de cutout (IBE)
- `center=x,y[unitate]`: fără unitate = **grade** (RA, Dec J2000); unități: `deg`, `rad`, `px`.
- `size=x[,y][unitate]`: fără unitate = **grade**; unități: `px`, `arcsec`, `arcmin`, `deg`, `rad`. Exemple oficiale: `size=3arcmin`, `size=200px`.
- `gzip`: implicit gzip pentru FITS simple; **cutout-urile SPHEREx (MEF) nu sunt gzip-uite**. Fiecare extensie e decupată la fel.
- Dacă decupajul depășește imaginea, rezultatul e **tăiat la zona suprapusă** (poate fi **ne-pătrat**); pixelii din afară apar ca **NaN**.
- **Fără suprapunere ⇒ HTTP 500**; unități sau mărimi invalide ⇒ **HTTP 400**.
- Dimensiunea maximă: **nedocumentată**.
- Exemplu oficial (cutout dintr-un fișier local IRSA):
  `https://irsa.ipac.caltech.edu/ibe/data/spherex/qr2/level2/2025W19_2B/l2b-v20-2025-247/3/level2_2025W19_2B_0073_2D3_spx_l2b-v20-2025-247.fits?center=156.09328159,-41.64466331&size=0.1`
- Tutorialul construiește URL-ul în SQL: `'https://irsa.ipac.caltech.edu/' || a.uri || '?center={ra},{dec}d&size={size}'` (grade, sufix `d`).
- **Cutout-ul e în orientarea nativă** a expunerii (nu nord-sus): **reeșantionarea noastră pe o grilă comună rămâne necesară**.

## 7. Performanță și limite (din tutorial)

- Interogare TAP: **~17 s** (84 de imagini într-un exemplu); cutout-uri: **~1 s fiecare** în serie; **paralel cu ThreadPool de 10** ⇒ ~10× mai rapid. Serverul **limitează cererile concurente**: tutorialul sugerează **7–12 fire**.
- Unele cereri eșuează (timeout, `HTTPError`, `IncompleteRead`, `RemoteDisconnected`): tutorialul le **omite**; noi trebuie **reîncercare** și mesaj de stare **parțială** în UI.
- Timeout de citire mărit la **120 s** în tutorial.
- Nu sunt documentate **limite de rată**, **cote** sau **termeni de utilizare** ai datelor (documentația e sub licență BSD-3). **De verificat:** politica de citare / redistribuire a datelor SPHEREx la IRSA, înainte să publicăm cutout-uri pre-calculate.

## 8. Ce înseamnă pentru proiect

1. **Metoda de acces e cunoscută:** TAP pentru a găsi imaginile (timp, bandă, poligon), apoi **cutout server-side** pe fiecare. Nu mai trebuie descărcate fișiere de 16 MB.
2. **Timpul observației:** din TAP (`time_bounds_lower`), nu din presupuneri despre cuvinte-cheie. `query.py` încearcă acum `MJD-OBS…`, apoi `DATE-OBS…`, dar **nu `DATE`**.
3. **Lungimea de undă:** din **WCS-WAVE** la poziția țintei ⇒ placa Epocă × λ devine fezabilă cu date reale.
4. **Zgomot:** folosim HDU **VARIANCE** pentru bare de eroare și praguri (nu estimări din inel). **ZODI:** fundalul zodiacal (important pentru asteroizi) se poate scădea sau afișa.
5. **PSF:** HDU PSF permite detecție cu filtru adaptat și centroizi mai buni (Find movers).
6. **Flag-uri:** mască de biți „răi”, nu „orice bit”.
7. **Latență:** o cerere live ≈ 17 s (TAP) + câteva secunde pentru cutout-uri în paralel ⇒ **progres pe etape** în UI, **cache** și **pre-calculare pentru cele 5 obiecte** (confirmă recomandarea din `BACKEND_INTEGRATION.md`).
8. **Cutout ne-pătrat / cu NaN la margini:** UI și fotometria trebuie să trateze zone lipsă.
9. **Câmpuri adânci** lângă polii eclipticii oferă **mai multe epoci**: bune pentru demo și pentru Find movers (de verificat dacă vreunul din cele 5 obiecte e acolo).
10. **Cum aflăm pozițiile obiectelor în fișiere:** TAP cu `CONTAINS(POINT(...), p.poly)`; testul simplu: un obiect test (WISE 0855) ⇒ câte imagini, în ce detectoare, ce date.

## 8b. Verificat pe o rulare reală (7 nov 2026, doar căutare, 0 fișiere descărcate)

Rulat cu `backend/scripts/fetch_real_sample.py` (vezi `REAL_DATA_TEST.md`), de pe rețeaua proiectului:

- **Endpoint TAP:** `https://irsa.ipac.caltech.edu/TAP/sync?REQUEST=doQuery&LANG=ADQL&FORMAT=csv&QUERY=...` răspunde cu CSV, în **3–15 s** per interogare (sursă: documentația TAP IRSA + tutorialul spherex-cutouts).
- **Interogarea din tutorial funcționează neschimbată** (tabelele `spherex.artifact` ⨝ `spherex.plane`, `CONTAINS(POINT('ICRS', ra, dec), p.poly)`, `ORDER BY p.time_bounds_lower`); coloanele folosite: `a.uri`, `p.planeid`, `p.time_bounds_lower` (MJD, confirmat: valori ca 60800.x), `p.energy_bandpassname` (`SPHEREx-D1` … `SPHEREx-D6`).
- **Forma `uri`:** cale relativă, fără `/` la început, ex. `ibe/data/spherex/qr2/level2/2025W33_2C/l2b-v20-2025-266/6/level2_2025W33_2C_0321_1D6_spx_l2b-v20-2025-266.fits`; prefixul `https://irsa.ipac.caltech.edu/` se adaugă. Numele fișierului conține detectorul (`1D6` = detectorul 6).
- **Datele există până în oct. 2026** (cele mai noi imagini văzute: 2026-10-02) și pentru toate cele 5 obiecte test:

| Obiect | Imagini | Treceri (grupuri la > 30 zile) pe detector |
|---|---|---|
| Barnard's Star | 359 | D1–D6: 3 |
| Epsilon Indi B | 445 | D1, D4: 3; D3, D6: 4; D2, D5: 5 |
| WISE 0855 | 256 | D1, D3, D4, D6: 3; D2, D5: 4 |
| RW Aurigae | 333 | D1–D6: 3 |
| R Draconis (câmp adânc) | 2483 | D1, D2, D4, D5: 3; D3, D6: 2 |

- Un detector are deci **~35–95 de imagini** în jurul unui obiect obișnuit (nu 6), iar în câmpul adânc sute (R Dra: 565–584 pe detector).
- **Încă nedescărcat și neverificat:** orice despre conținutul fișierelor (mărime, cuvinte-cheie, WCS, WCS-WAVE, flag-uri). Asta face Pasul B din `REAL_DATA_TEST.md`.

## 8c. Verificat pe fișiere REALE (7 nov 2026: 4 cutout-uri ale lui Barnard's Star, detector D2, aug. 2025 → sept. 2026)

- **Cutout de 5′:** 4–5 MB, 9–15 s fiecare; 49×49 px (sau tăiat la marginea detectorului: 37×49, deci **ne-pătrat**, ca în documentație). HDU: PRIMARY, IMAGE, FLAGS, VARIANCE, ZODI, PSF (numit EPSF în cele mai noi), WCS-WAVE.
- **Timp:** `MJD-OBS`, `MJD-AVG`, `MJD-BEG`, `DATE-OBS`, `DATE-AVG` etc. sunt în header, deci `query.py` îl citea corect de la început. **`DATE` e data creării fișierului** (ex. 2025-09-24 pentru o observație din 2025-08-21): nu se folosește. Timpul din TAP (`time_bounds_lower`) coincide cu `MJD-OBS`.
- **Scara:** 6,14″/px; WCS `TAN-SIP` (distorsiune SIP; astropy afișează un INFO inofensiv despre sufixul `-SIP`).
- **Steaguri:** **bitul 21 e setat pe TOȚI pixelii**, deci „orice bit ≠ 0" ar marca 100 % din imagine. Corectat în `backend/spherex/flags.py` (doar biții „răi"; rămân 4–7 % pixeli marcați). Biți observați: 0, 1, 2, 6, 11, 17, 21, 26, 28 (26 și 28 nu apar în tabelul de mai sus).
- **Lungimea de undă:** `WCS-WAVE` merge cu rețeta din tutorial, iar **fiecare imagine are banda ei, chiar pe același detector D2**: 1,088–1,114; 1,497–1,535; 1,639–1,678; 1,493–1,530 µm. Într-un cutout de 5′ centrul și ținta diferă cu ~0,002 µm. Banda „nominală" 1,10–1,62 µm a mock-ului ar fi făcut graficul de spectru inutil; `query.py` citește acum banda din WCS-WAVE.
- **Mișcarea (validare cap-coadă):** din cele 4 imagini, mișcarea proprie a lui Barnard's Star măsurată cu centroid e **−1,9 / +11,2 ″/an** (RA·cos δ / Dec), față de **−0,8 / +10,4** în catalog; steaua stă la 1,6–3,6″ (0,26–0,58 px) de poziția din catalog în toate cele 4 epoci, fără decalaj sistematic. Timpul, WCS-ul și orientarea (nu e oglindită) sunt corecte.
- **Find movers pe aceste date** (4 imagini, prin backend): găsește Barnard's Star și îl etichetează „(known)", dar viteza iese 18,7″/an (catalog 10,4): cu 4 imagini, 1 px de zgomot de poziție (resamplare nearest-neighbour + PNG pe 8 biți) și doar ~1 an de bază, panta e slab determinată. Identificarea e corectă, valoarea numerică nu e încă bună.

## 8d. Verificat pe 39 de fișiere REALE (7 nov 2026: Barnard D2 + D6, Epsilon Indi B D2 + D6, un cutout cu asteroidul Arosa) – vezi [VALIDATION.md](VALIDATION.md)

- **Unități:** `BUNIT = MJy/sr`. Conversia în Jansky: flux (MJy/sr · pixeli) × 10⁶ × (pixel în rad)² (aplicată în `backend/spherex/photometry.py`).
- **Stele foarte strălucitoare:** Barnard's Star are vârf de 580–1980 MJy/sr, iar în nucleul de 5×5 pixeli sunt setați biții **0** (tranzient), **1** (overflow) și **2** (eroare SUR) în 24–84 % din pixeli (D6 și D2). Deci aperturile și pozițiile lui sunt nesigure (fluxul e o limită inferioară). Biții 0, 1, 2 sunt în lista „răi" din `flags.py`, deci cele 21 de măsurători sunt marcate `flagged`.
- **Alți biți observați în plus:** 17 (rar, o dată) și 26 (în imaginile din 2026; nu e în tabelul din documentația citită; netratat ca „rău").
- **WCS:** distorsiunea SIP a unui fișier **diverge** departe de imagine (`NoConvergence` în `all_world2pix`) când indexezi mai multe câmpuri: `LocalArchive.find` o tratează acum ca „poziția nu e în acest cadru" (înainte, `/api/photometry` dădea HTTP 500).
- **SkyBoT (IMCCE)**, verificat de pe rețeaua proiectului: `https://ssp.imcce.fr/webservices/skybot/api/conesearch.php?-ep=<JD>&-ra=&-dec=&-rd=<grade>&-mime=json&-output=basic&-loc=500` răspunde JSON cu `Access-Control-Allow-Origin: *` (browserul îl apelează direct, **fără proxy**), 204 când nu e niciun corp, 400 cu mesaj JSON la parametri greșiți; adresa veche `vo.imcce.fr` dă 403. Epoca e data iuliană (MJD + 2400000,5). Un asteroid din centura principală face ~570″/zi: se caută la data fiecărei imagini.

## 9. Încă neclar / de verificat

- Cuvântul-cheie exact pentru **timpul observației** în header (`DATE` = observație sau creare?).
- **Dimensiunea maximă** a unui cutout și limitele de rată.
- **Termenii de utilizare / citarea** datelor.
- **Punctul tău de pornire pentru cod:** același cutout cere `size` în grade; câmpul nostru de 1–30′ = 0,0167–0,5° (`size=5arcmin` e valid).
- Dacă **QR2/QR3** acoperă pozițiile celor 5 obiecte și câte epoci avem acolo.
- **Atenție la calitatea documentației:** unele valori din tutorial (ex. „0,615″”) par să vină din secțiunea PSF; nu le folosi fără verificare pe un fișier real.
