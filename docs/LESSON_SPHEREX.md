# Lecție: ce este proiectul tău, pas cu pas

Scop: să înțelegi tema suficient de bine ca să îmi dai indicații bune, să judeci ce e important și să poți explica proiectul juriului.
Timp: ~45 de minute de citit, apoi testul de la final.

Etichete: **[sigur]** = cunoștințe stabile · **[din memorie]** = cred că e corect, dar verifică pe site-urile oficiale · **[estimarea mea]** = calcul făcut de mine, cu ipotezele spuse.

> **Actualizare 6 nov – confirmat din documentația IRSA/SPHEREx** (detalii și surse în [IRSA_FACTS.md](IRSA_FACTS.md)): filtrele variabile liniar și lungimea de undă **per pixel** (tabelul WCS-WAVE), pixelul de **~6,15″**, cele **6 detectoare observate în perechi (1+4, 2+5, 3+6)**, **D2 = 1,10–1,62 µm**, structura fișierului (IMAGE în HDU 1, FLAGS în HDU 2, plus VARIANCE, ZODI, PSF, WCS-WAVE), unitatea **MJy/sr**, 4 hărți în ~2 ani cu **câmpuri adânci** lângă polii eclipticii. Ce a rămas **[din memorie]** mai jos (data lansării, scopuri științifice) nu l-am verificat.

---

## 1. Ideea într-o frază

> Cerul are o mulțime de lucruri care **stau pe loc** (aproape toate stelele) și câteva care **se mișcă sau își schimbă luminozitatea**.
> Dacă fotografiezi același loc de pe cer în momente diferite și compari pozele, le găsești pe cele care s-au schimbat.

E ca jocul „găsește diferențele”, dar pe cerul real. Aplicația ta e jocul, făcut cu imagini de la telescopul spațial **SPHEREx**.

## 2. De ce se numește „Planet X” (povestea care merită în video)

- La începutul anilor 1900, astronomul **Percival Lowell** credea că există o planetă dincolo de Neptun și a numit-o „Planet X” **[sigur]**.
- În 1930, **Clyde Tombaugh** a căutat-o la Observatorul Lowell cu un **blink comparator**: o mașină care arată rapid, pe rând, două fotografii ale aceluiași loc de pe cer, făcute la zile distanță. Obiectele fixe stau pe loc; ce se mișcă „sare”. A găsit **Pluto** **[sigur]**.
- Ce faci tu în aplicație e același truc, la scară modernă. Butonul „Blink” e o legătură directă cu acea poveste.
- Azi „Planet X” / „Planet Nine” e o ipoteză despre o planetă încă nedescoperită, foarte departe de Soare **[sigur că e ipoteză]**. Nu există dovezi confirmate. În proiect nu promitem că o găsim; spunem că **construim unealta cu care oamenii pot căuta** obiecte care se mișcă.
- Există deja un proiect de știință cetățenească similar, **Backyard Worlds: Planet 9**, care folosește animații de imagini WISE pentru a găsi pitici brune **[din memorie; verifică]**. Merită menționat ca „lucru înrudit”; diferența ta: SPHEREx și dimensiunea de **lungime de undă**.

## 3. Cum spunem unde ne uităm pe cer: coordonatele

- **RA** (ascensie dreaptă) și **Dec** (declinație) sunt „longitudinea și latitudinea” cerului **[sigur]**.
  - RA: 0–360° (sau 0–24 de ore, 1 oră = 15°).
  - Dec: −90° (polul sud ceresc) … +90° (polul nord ceresc).
- Se scriu în **grade** (133.7951) sau **sexagesimal** (08h55m10.8s, −07°14′42″). Aplicația ta le acceptă pe amândouă.
- **Sistem de referință:** ICRS, aproape identic cu J2000 pentru ce facem noi **[sigur]**. Pozițiile din cataloage sunt date „la epoca 2000”; obiectele care se mișcă s-au deplasat de atunci. De aceea `targets.js` le propagă la 2026.
- **Unități de unghi:** 1° = 60′ (arcminute) = 3600″ (arcsecunde). Luna are ~30′ ca diametru, deci un câmp de 30′ e cât Luna **[sigur]**. Câmpul tău implicit, 5′, e o șasea parte din Lună.
- **Scara pixelilor:** SPHEREx are ~6,2″ pe pixel **[din memorie; vine din header]**. Un câmp de 5′ înseamnă 300″ / 6,2″ ≈ **48 × 48 pixeli**. Sunt imagini mici și „pixelate”; e normal.

## 4. Cum se mișcă obiectele pe cer

- **Mișcare proprie:** o stea sau pitică brună se deplasează lent pe cer, în unghi pe an (mas/an = miimi de arcsecundă pe an). Cu cât e mai aproape de noi, cu atât pare să se miște mai repede **[sigur]**.
  - Barnard's Star: ~10,4″/an. WISE 0855: ~8,15″/an. Epsilon Indi B: ~4,7″/an (valorile din `targets.js`, din SIMBAD).
  - La 6,2″/pixel, WISE 0855 înseamnă ~**1,3 pixeli pe an**, deci ~0,65 pixeli în șase luni. **Mult sub un pixel între două treceri**: de asta nu se vede cu ochiul într-un blink simplu și avem Difference, Trail și poziția prezisă.
- **Paralaxa:** Pământul se mișcă pe orbită, deci un obiect apropiat pare să „danseze” pe fundalul stelelor în ritm anual. Formula: paralaxa (în arcsecunde) = 1 / distanța (în parseci) **[sigur]**.
- **Planet X, ordin de mărime [estimarea mea, ipoteze: orbită circulară, 500 UA, privită din față]:**
  - paralaxa ≈ 1 / (500/206265 pc) ≈ **412″** (~66 de pixeli); între două treceri la 6 luni deplasarea poate ajunge la **~800″ (~130 de pixeli)**;
  - mișcarea proprie pe orbită ≈ **~100″/an** (~20 de pixeli pe an).
  - Deci pentru un obiect îndepărtat, **paralaxa domină** și deplasările pot fi mari, nu „arcsecunde pe an”. Un detector de mișcare trebuie să accepte și deplasări de zeci de pixeli.
  - **Nu se știe** dacă SPHEREx ar putea detecta un astfel de obiect (ar fi foarte rece și slab). Nu promite asta.

## 5. Ce este SPHEREx

Telescop spațial NASA, lansat în **martie 2025** **[din memorie; verifică data]**. Numele: *Spectro-Photometer for the History of the Universe, Epoch of Reionization and Ices Explorer*.

- Face o **hartă a întregului cer** în **102 „culori”** (benzi spectrale), de la **0,75 la 5 µm**, în infraroșu apropiat **[confirmat în enunțul provocării, așa cum mi l-ai descris]**.
- Repetă harta la aproximativ **fiecare 6 luni**, deci avem „poze” din epoci diferite: exact ce ne trebuie pentru blink.
- Scopurile științifice oficiale (nu ale noastre) **[din memorie]**: cum a început universul (inflația), cum s-au format galaxiile, unde se găsesc **gheața de apă, CO₂ și CO** în nori de gaz. Asta înseamnă că nu e făcut special pentru obiecte în mișcare; noi folosim datele lui pentru altceva. Merită spus în prezentare.
- Are **6 detectoare** (matrici de pixeli); fiecare acoperă un interval de lungimi de undă.

## 6. Lungimea de undă, pe înțelesul tuturor

**Lumina e o undă; lungimea de undă e „culoarea” ei.** Se măsoară în **micrometri (µm)**: 1 µm = o milionime de metru = 1000 nm **[sigur]**.

| Lumina | Lungime de undă |
|---|---|
| Violet … roșu (ce vezi cu ochii) | ~0,4 … 0,7 µm |
| **SPHEREx** („infraroșu apropiat”) | **0,75 … 5 µm** |
| Căldura pe care o simți de la o persoană | ~10 µm |

De ce ne interesează infraroșul **[sigur]**:
1. **Obiectele reci strălucesc în infraroșu**, nu în vizibil. Un obiect de temperatura camerei emite mai ales în infraroșu.
2. **Praful lasă infraroșul să treacă** mai ușor decât lumina vizibilă.
3. Lumina galaxiilor foarte îndepărtate e „întinsă” de expansiunea universului spre lungimi de undă mai mari.

**Legea lui Wien** (cu cât e mai rece, cu atât lungimea de undă la care emite cel mai mult e mai mare): λ_max ≈ 2898 µm·K / T **[sigur]**.
- Soare, ~5800 K → ~0,5 µm (vizibil, galben-verde).
- Pitică brună de ~1000 K → ~2,9 µm.
- WISE 0855, ~250 K → ~11,6 µm, **în afara** intervalului SPHEREx; dar SPHEREx vede partea ascendentă și o „fereastră” în jur de **4–5 µm** prin care iese mult din lumina lui **[din memorie; fizica generală e sigură, detaliul ferestrei de verificat]**.

Ce rezultă pentru aplicație:
- O pitică brună rece e **aproape invizibilă la 1 µm** și **mult mai strălucitoare la 4–5 µm**. Ca să o vezi, alegi detectoarele cu lungimi de undă mari (D5, D6 în ipoteza noastră). Mock-ul îți arată deja asta (mover-ul e mai luminos la lungimi mari).
- O stea obișnuită are spectrul **plat sau descrescător** spre 5 µm. Forma **spectrului** (luminozitate în funcție de lungimea de undă) ajută să distingi tipurile de obiecte. De aceea avem graficul de spectru.

## 7. Cum „vede” SPHEREx culorile (partea cea mai subtilă)

SPHEREx folosește **filtre variabile liniar (LVF)**: o bandă de sticlă a cărei „culoare permisă” **se schimbă gradual** de la un capăt la altul, ca un curcubeu **[din memorie; conceptul e sigur]**.

- Fiecare detector e acoperit de un astfel de filtru. Deci **în aceeași imagine, partea stângă „vede” altă lungime de undă decât partea dreaptă**.
- Telescopul își mută privirea între expuneri; o sursă ajunge în poziții diferite pe detector și e **măsurată la lungimi de undă diferite**. Spectrul complet al unei surse se construiește din **multe expuneri**.
- Consecințe importante pentru noi:
  1. Un „cadru” nu are **o** lungime de undă, ci una **care depinde de poziția sursei pe detector**. De aceea am marcat în `DATA_CHECKLIST.md` să calculăm lungimea de undă **la poziția cutout-ului**.
  2. **Capcană științifică:** dacă două cadre ale aceluiași obiect sunt la lungimi de undă diferite, luminozitatea poate diferi **doar pentru că spectrul obiectului nu e plat**, nu pentru că obiectul s-a mișcat sau a variat. Un blink „naiv” între lungimi de undă foarte diferite poate păcăli.
  3. Soluții de design: afișăm lungimea de undă a fiecărui cadru **la poziția țintei**; permitem să alegi cadre cu lungimi de undă apropiate; avem Stack pentru imagini „adânci”.
  4. Aceasta e o idee bună pentru criteriul „Validity”: arăți că ai înțeles datele, nu doar că ai pus imagini una după alta.

## 8. Cele 6 detectoare

În mock folosim aceste intervale, care sunt **presupuneri marcate** (aproximative, din memorie; de confirmat în documentația SPHEREx):

| Detector | Interval (µm) | Ce e bun de văzut |
|---|---|---|
| D1 | 0,75 – 1,09 | stele, galaxii „albastre” |
| D2 | 1,10 – 1,62 | idem |
| D3 | 1,63 – 2,41 | stele reci |
| D4 | 2,42 – 3,82 | început de „zonă termică” |
| D5 | 3,83 – 4,41 | **pitici brune reci** |
| D6 | 4,42 – 5,00 | **pitici brune reci**, gheață CO |

Fiecare detector are 17 canale (6 × 17 = 102 benzi). Pentru gheață: H₂O la ~3,0 µm, CO₂ la ~4,27 µm, CO la ~4,67 µm **[din memorie]**.
Perechile de detectoare observate împreună (D1+D4 etc.) sunt **neconfirmate**; le aflăm din date.

## 9. Datele: de la telescop la ecranul tău

1. Telescopul face o **expunere**; rezultă un **fișier FITS**, formatul standard în astronomie **[sigur]**.
2. Un FITS are mai multe **HDU** (blocuri): de exemplu imaginea științifică, o mască de pixeli proști (flag-uri), eventual zgomot sau lungime de undă. Fiecare are un **header** (text cu metadate: data, detectorul, unități) **[sigur]**. Ipoteza noastră „știința în HDU 1, flag-uri în HDU 2” **trebuie verificată**.
3. **WCS** = „harta” care leagă pixelii de coordonatele cerești (RA/Dec). Datorită ei știm ce pixel corespunde cărei poziții **[sigur]**. Fără WCS valid nu putem tăia un cadru în jurul unei poziții.
4. **MJD** (Modified Julian Date) = numărul de zile de la o dată de referință; o modalitate simplă de a pune o dată într-un singur număr **[sigur]**. Exemplu: 60800,7 ≈ 5 mai 2025.
5. **Unități:** luminozitatea e adesea în MJy/sr (megajanskyi pe steradian) **[din memorie]**; noi o tratăm ca „unități de imagine” până confirmăm.
6. Imaginile complete sunt mari (~2040 × 2040 pixeli, ~16 MB), așa că **backend-ul taie un cutout mic** în jurul poziției tale; browserul nu descarcă imaginea întreagă.
7. **Nu toate cadrele sunt aliniate:** fiecare expunere poate fi rotită. De aceea le reeșantionăm pe aceeași grilă (nord sus, est stânga), altfel stelele ar „roti” în blink.
8. **Stretch** = cum transformăm numerele în tonuri de gri ca să vedem și obiectele slabe (folosim asinh). **Flag-uri** = pixeli marcați ca nesiguri (raze cosmice, pixeli defecți).

## 10. Cum găsești un obiect în mișcare (cele 3 metode din aplicație)

| Metodă | Ce face | Când ajută |
|---|---|---|
| **Blink** | arată cadrele pe rând | mișcări de câțiva pixeli |
| **Difference** | scade imaginea „de referință” (mediana altor epoci): stelele fixe dispar; portocaliu = „acum e aici”, albastru = „era aici” | mișcări sub-pixel; câmpuri aglomerate |
| **Trail** | păstrează maximul fiecărui pixel: un mover lasă o dungă | mișcare pe mai multe epoci |

Cum distingi:
- **Mover:** un punct care apare în locuri diferite, pe o traiectorie netedă.
- **Variabilă:** stă pe loc, dar își schimbă luminozitatea (R Draconis și RW Aurigae sunt exemple).
- **Artefact:** apare într-un singur cadru, e pe un pixel marcat cu flag, sau are formă ciudată (rază cosmică, pixel defect).
- **Atenție la lungimea de undă** (secțiunea 7): o schimbare de luminozitate poate fi doar efectul filtrului.

## 11. Cele 5 obiecte de test (și de ce au fost alese)

| Obiect | Tip | Ce arată |
|---|---|---|
| **Barnard's Star** | stea apropiată, mișcare proprie foarte mare (~10,4″/an) | un mover „ușor”, vizibil |
| **Epsilon Indi B** | pitică brună dublă (~4,7″/an) | mover rece, mai ușor la lungimi de undă mari |
| **WISE 0855** | cea mai rece pitică brună cunoscută (~250 K, la ~2,3 pc); ~8,15″/an | cazul de prezentare: mișcare mică, luminoasă doar la 4–5 µm |
| **RW Aurigae** | stea tânără variabilă | **nu se mișcă**, dar își schimbă luminozitatea |
| **R Draconis** | stea Mira (pulsează, perioadă de ordinul a 8 luni; de verificat) | variabilă cu amplitudine mare |

Lecția: 3 obiecte „se mișcă”, 2 „variază”; unealta trebuie să le arate diferit.

## 12. Cum se leagă tot de aplicație

| Concept | Unde apare în aplicație | Fișier |
|---|---|---|
| Coordonate | formular RA/Dec, validare | `coords.js` |
| Mișcare proprie | poziție prezisă, viteza în px/an | `targets.js`, `geometry.js` |
| Epoci | Blink, slider | `player.js` |
| Difference/Trail | moduri de vizualizare | `player.js` |
| Spectru | grafic după click | `features/measure.js` |
| Lungime de undă | metadate cadru, spectru | `data/`, backend `query.py` |
| FITS/WCS/cutout | decupaj, aliniere | `backend/spherex/cutout.py` |
| Flag-uri | mască roșie, „skip” | `main.js`, `stretch.py` |
| Context pe cer | Aladin | `features/skyContext.js` |

## 13. Glosar (rapid)

**Arcsecundă (″)** 1/3600 de grad · **Asinh** tip de stretch · **Benzi (bands)** „culorile” SPHEREx · **Blink** alternarea imaginilor · **Cutout** decupaj mic dintr-o imagine mare · **Detector/array** matrice de pixeli · **Dec** declinație · **Difference imaging** imagine minus referință · **Epocă** moment al observației · **Expunere/cadru** o imagine · **FITS** format de fișiere astronomice · **Flag** pixel marcat nesigur · **Flux** cantitate de lumină măsurată · **FOV** câmp de vedere · **HDU** bloc dintr-un FITS · **Header** metadate · **ICRS/J2000** sistem de coordonate · **IRSA** arhiva NASA/IPAC unde sunt datele · **LVF** filtru variabil liniar · **MJD** dată ca număr · **Mișcare proprie** deplasare pe cer pe an · **Paralaxă** deplasare aparentă din mișcarea Pământului · **Pitică brună** obiect mai mare ca o planetă și prea mic pentru a fi stea · **Pixel scale** secunde de arc pe pixel · **Pass/survey** o hartă completă a cerului · **RA** ascensie dreaptă · **SIMBAD** catalog de obiecte astronomice · **Spectru** luminozitate în funcție de lungimea de undă · **Stack** medie de imagini · **Stretch** transformare în tonuri de gri · **WCS** legătura pixel ↔ coordonate cerești · **µm** micrometru.

## 14. Test de înțelegere (răspunde pe hârtie, apoi compară)

1. Câți pixeli are un câmp de 5′ la 6,2″/px?
2. De ce nu vedem WISE 0855 într-un blink simplu la 1 µm?
3. De ce, la SPHEREx, un cadru nu are „o singură” lungime de undă?
4. Ce înseamnă portocaliu și albastru în modul Difference?
5. Cum deosebești o stea variabilă de un mover?
6. De ce e „Planet X” legat de blink comparator?
7. De ce backend-ul decupează imaginea, în loc să trimită tot fișierul?
8. Ce se întâmplă cu poziția unui obiect dacă ignori mișcarea proprie și folosești coordonatele din 2000?

<details><summary>Răspunsuri</summary>

1. ~48 × 48 (300″ / 6,2″).
2. E o pitică foarte rece: strălucește mai ales la 4–5 µm; la ~1 µm e foarte slabă, iar mișcarea e < 1 px între epoci.
3. Filtrele LVF: lungimea de undă depinde de poziția sursei pe detector.
4. Portocaliu = mai luminos decât referința (obiectul e aici acum); albastru = mai slab (era aici înainte).
5. Variabila stă pe loc și își schimbă luminozitatea; moverul își schimbă poziția pe o traiectorie.
6. Tombaugh a descoperit Pluto (căutând „Planet X” al lui Lowell) cu un blink comparator.
7. Fișierele sunt mari (~16 MB); un cutout are zeci de KB.
8. Cutout-ul ar fi centrat greșit; pentru Barnard's Star, după 26 de ani, ~4,5′, deci aproape de marginea câmpului de 5′.
</details>

---

## 15. Ce poți face TU ca să ajuți (fără cod)

- Citește pagina provocării și notează fiecare cerință exactă (copiază textul în `docs/evidence/`).
- După ce se deschid resursele: copiază în chat **linkurile**, **numele serviciilor de date**, **un exemplu de răspuns / header FITS**.
- Verifică pe site-urile oficiale ce am marcat **[din memorie]**.
- Testează aplicația pe telefon și pe alt browser și spune-mi ce ți se pare confuz.
- Arată-mi 3–5 site-uri / aplicații de astronomie care îți plac (Aladin, WorldWide Telescope, Zooniverse, Stellarium Web) și ce anume îți place la fiecare.
- Răspunde la întrebările de design din `docs/FRONTEND_PLAN.md` (secțiunea 9).
