# Ghid: cum lucrăm împreună și ce prompturi să-mi dai

Stare: 6 nov 2026. Scop: să primești de la mine exact ce ai nevoie, repede și verificat.

---

## 1. Ce înseamnă un „prompt bun” aici

Folosește forma **CONTEXT – SCOP – CONSTRÂNGERI – GATA CÂND – VERIFICĂ**. Nu trebuie lung, dar trebuie complet.

```
CONTEXT:  (unde suntem: fișier / ecran / eroare / link)
SCOP:     (ce vreau să se întâmple, pentru cine)
CONSTRÂNGERI: (stil, tehnologii, ce NU trebuie schimbat, termene)
GATA CÂND: (criterii verificabile)
VERIFICĂ: (cum să dovedești: test, captură, comandă)
```

Reguli care îmi cresc mult calitatea:
1. **Spune-mi ce e fapt și ce e presupunere.** Eu fac la fel și marchez [verificat] / [presupus].
2. **Lipește erorile și rezultatele exacte** (text din consolă, header FITS, răspuns API), nu descrieri.
3. **Dă-mi criterii de „gata”** (ex. „WISE 0855 e la < 0,5 px de tick-uri în toate cadrele”).
4. **Cere-mi întâi un plan** pentru lucruri mari; abia apoi implementarea.
5. **Spune-mi ce nu vrei** (ex. „fără gradient violet”, „fără dependențe noi”).
6. Pentru design: **trimite capturi** ale lucrurilor care îți plac și spune *ce anume* îți place.

## 2. Ce poți aduce tu (informații pe care eu nu le pot obține)

- Textul exact al **cerințelor oficiale** (copiat din browserul tău; eu nu pot deschide site-ul oficial de pe rețeaua ta).
- Răspunsurile **organizatorilor** și din forum (Space Apps Connect).
- Linkurile și exemplele de date când se deschid resursele.
- **Capturi** de pe telefon / alt browser, cu ce nu merge.
- **Preferințe:** culori, ton, nume, limbă.
- **Reacții:** ce ți se pare confuz când privești aplicația fără explicații.
- Rezultate de **testare cu oameni** (ce au înțeles în 5 secunde).

## 3. Ce prompturi să-mi dai, pe faze

### Învățare (permis oricând)
- „Verifică-mă din `docs/LESSON_SPHEREX.md`: pune-mi 10 întrebări, una câte una, și corectează-mă.”
- „Explică-mi X (ex. filtru variabil liniar) cu o analogie și un exemplu numeric; marchează ce e [sigur] și ce e [din memorie].”
- „Ce ar trebui să știu despre Y ca să pot răspunde la întrebările juriului?”
- „Simulează un jurat care critică proiectul; pune-mi 8 întrebări grele și evaluează răspunsurile.”

### Design (plan; cod doar după clarificarea regulii)
- „Fă 3 direcții de design pentru ecranul principal (consolă de observator / educațional / minimal) cu avantaje, riscuri și machetă ASCII.”
- „Evaluează ecranul actual după anti-pattern-urile din `ecc:frontend-design-direction` și propune modificări prioritizate.”
- „Scrie conținutul (micro-copy) pentru turul ghidat, 6 pași, max 20 de cuvinte fiecare, engleză simplă.”
- „Fă un audit de accesibilitate WCAG 2.2 AA al canvas-ului interactiv și propune echivalente de tastatură.”

### Cod (după ce știm ce e permis)
- „Implementează [funcția] conform `docs/FRONTEND_PLAN.md` secț. 4 (rând X). Criterii de gata: …; adaugă teste; arată-mi o captură la 375 px și 1440 px.”
- „Depanează: [lipește eroarea]. Reproduce întâi problema cu un test, apoi repară.”
- „Revizuiește diff-ul: corectitudine, cazuri-limită (RA 0°/360°, un cadru, zero cadre), securitate.”

### Date reale
- „Iată header-ul FITS: [lipește]. Compară-l cu presupunerile din `backend/spherex/query.py` și propune modificări minime.”
- „Iată răspunsul serviciului IRSA: [lipește]. Alege din arborele de decizie din `docs/BACKEND_INTEGRATION.md` și fă planul.”
- „Validează WISE 0855 pe tick-urile verzi și raportează offset-ul pe cadru.”

### Documentație și predare
- „Scrie descrierea proiectului (200 de cuvinte, engleză) după criteriile de jurizare: Impact, Creativity, Validity, Relevance, Presentation.”
- „Scrie scenariul video de 30 s și de 90 s, cu subtitrări în engleză și indicații de ecran.”
- „Pregătește declarația de folosire a AI și istoricul dezvoltării (adevărat, concret).”
- „Verifică repo-ul înainte de publicare: secrete, fișiere mari, licență, README.”

## 4. Skill-uri, agenți și unelte pe care le ai și când să le folosești

Notă: pentru unele din ele am citit descrierea; pentru altele știu doar numele. Le-am marcat. Înainte să folosesc unul necitit, îl încarc și îți spun ce face.

| Nevoie | Instrument | Ce știu despre el |
|---|---|---|
| Direcție de design, stări, verificare pe randare | `ecc:frontend-design-direction` | **Citit**: scop / public / ton / detaliu memorabil, anti-pattern-uri, poartă de randare cu dovezi |
| Accesibilitate | `ecc:accessibility`, agentul `ecc:a11y-architect`, `ecc:frontend-a11y` | Descriere: WCAG 2.2 AA, ARIA, focus, contrast, țintă tactilă |
| Grafice | `dataviz` | **Folosit deja** (paletă validată pentru daltoniști) |
| Performanță | agentul `ecc:performance-optimizer` + uneltele `chrome-devtools` (Lighthouse, trasee de performanță) | Descrieri; uneltele chrome-devtools trebuie încărcate înainte de folosire |
| Teste din browser | agentul `ecc:e2e-runner`, `ecc:browser-qa`, `ecc:e2e-testing` | Doar nume/descriere scurtă |
| Revizuire cod | `ecc:code-reviewer`, `ecc:python-reviewer`, `ecc:fastapi-reviewer`, `ecc:typescript-reviewer` | Descrieri |
| Securitate (SSRF, injecții) | `ecc:security-reviewer`, `ecc:security-review` | Descrieri |
| Erori înghițite / fallback-uri proaste | `ecc:silent-failure-hunter` | Descriere |
| Teste | `ecc:tdd-guide`, `ecc:test-coverage`, `ecc:python-testing` | Descrieri / nume |
| Documentație actuală a bibliotecilor (astropy, FastAPI) | agentul `ecc:docs-lookup` (Context7) | Descriere |
| Cercetare / citate științifice | `ecc:deep-research`, `ecc:scientific-thinking-literature-review` | Doar nume |
| Descrierea proiectului | `ecc:article-writing` | Descriere |
| Prezentare (slide-uri) | `ecc:frontend-slides` | Doar nume |
| Video / animații explicative | `ecc:manim-video`, `ecc:remotion-video-creation`, `ecc:video-editing`, `ecc:ui-demo` | Doar nume; verific înainte de folosire |
| Publicarea repo-ului (secrete, LICENSE, README) | `ecc:opensource-pipeline`, agenții `ecc:opensource-sanitizer`, `ecc:opensource-packager` | Descrieri (sanitizer: caută secrete / date personale înainte de lansare) |
| Mesaje de commit | agentul `ecc:commit-reviewer`, `ecc:conventional-commit-review` | Descriere |
| Decizii documentate | `ecc:architecture-decision-records` | Descriere |
| Planuri | `ecc:plan`, `ecc:plan-prd`, agentul `ecc:planner` | Descriere (`ecc:plan` așteaptă confirmarea ta înainte de cod) |
| Auto-evaluare a calității | `ecc:agent-self-evaluation`, agentul `ecc:agent-evaluator` | Descriere |

**Atenție:**
- Unele skill-uri apelează **servicii externe** sau altă companie de AI (de exemplu `ecc:astra-review`, `ecc:multi-*`, referințele UIZZE menționate în skill-ul de design). Nu le folosesc fără acordul tău și nu trimit cod sau date în afara calculatorului fără să te întreb.
- Nu instalez pachete și nu conectez servicii fără acordul tău.

## 5. Cele 10 prompturi cele mai utile acum

1. „Verifică-mă din lecție, 10 întrebări.”
2. „Fă 3 direcții de design pentru ecranul principal și recomandă una.”
3. „Scrie micro-copy-ul pentru turul ghidat.”
4. „Evaluează UI-ul actual după anti-pattern-uri și dă-mi o listă prioritizată.”
5. „Proiectează placa Epocă × λ: date necesare, interacțiuni, stări.”
6. „Pregătește postările pentru forum și lista de întrebări pentru organizatori.”
7. „Fă planul pe ore pentru 14–15 nov, cu MVP-ul de predare.”
8. „Scrie descrierea proiectului și declarația de AI (adevărate și concrete).”
9. „Pregătește scenariul video de 30 s și de 90 s.”
10. „Simulează un jurat și critică-mi proiectul.”

## 6. Cum arată un proiect „top” pentru juriu (criteriile din 2025; verifică lista 2026)

| Criteriu | Ce arătăm concret |
|---|---|
| **Impact** | Unealtă publică, fără instalare; reduce munca de a inspecta manual imagini; folosibilă în educație și știință cetățenească |
| **Creativity** | Placa Epocă × λ, compozit RGB pe epoci, poziție prezisă vs observată, Find movers |
| **Validity** | Date reale (dacă se poate), proveniență clară, validare pe WISE 0855 (< 0,5 px), limite recunoscute onest, atenție la capcana LVF |
| **Relevance** | Răspunde exact la „vizualizează cum se schimbă obiectele în timp” + bonusuri (spectre, cataloage) |
| **Presentation** | Flux-erou de 30 s, poveste (Lowell → Tombaugh → SPHEREx), video clar, README cu GIF, text în engleză simplă |

## 7. Ce e permis acum și ce nu (până se clarifică regula)

- **Permis, în spiritul „te poți pregăti și învăța”:** lecția, plan, design pe hârtie, întrebări, liste, citit documentație, pregătit conturi și unelte.
- **De evitat până la răspunsul organizatorilor:** scrierea de cod nou pentru soluția pe care o vei depune.
- Dacă ești în dubiu, **întreabă organizatorii** (postările din `docs/TODO.md`, Anexa A).
