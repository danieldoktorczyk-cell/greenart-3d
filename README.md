# Green Art — Podróż przez ogrody (3D, wersja demo)

Strona w całości w 3D: przewijając, idziesz ścieżką przez pięć ogrodów, a pora dnia zmienia się od porannej mgły do zachodu słońca.

| Etap | Ogród | O czym opowiada |
| --- | --- | --- |
| Brama | poranna łąka, nad ścieżką unosi się perłowy wieniec (logo) | wstęp |
| I. Łąka | rzędy lawendy, aleja topoli | rozmowa i projekt |
| II. Parter | kamera wznosi się nad bukszpanowy ogród z fontanną | architektura krajobrazu |
| III. Staw | przejście po kamieniach nad wodą, japońskie klony | realizacja |
| IV. Kwiaty | pole kwiatów w ciepłym popołudniowym świetle | florystyka |
| V. Pergola | tunel róż i lampionów o złotej godzinie | opieka nad ogrodem |
| Polana | wieniec o zmierzchu, formularz kontaktowy | kontakt |

Cały świat powstaje w kodzie: teren, rośliny, niebo i woda. Strona nie używa żadnych zdjęć ani modeli, więc nie ma kwestii licencji.

**Technologia:** Vite + TypeScript + three.js (WebGL) + Lenis (płynny scroll) + Tailwind CSS.

## Jak to działa (w skrócie)

- Teren, drzewa, lawenda, bukszpan, kwiaty i róże są generowane w osobnym wątku (Web Worker), więc strona nie przycina się podczas ładowania.
- Trawa to łatka ok. 150 tys. źdźbeł (50 tys. na telefonie), która „wędruje” razem z kamerą i kołysze się na wietrze w shaderze.
- Pozycja przewijania wyznacza miejsce na ścieżce. Każda sekcja tekstu ma atrybut `data-z`, czyli punkt drogi, w którym się pojawia.
- Na telefonach i słabszych komputerach automatycznie włącza się lżejsza wersja (mniej trawy i drzew, niższa rozdzielczość).
- Przy ustawieniu „ogranicz ruch” (`prefers-reduced-motion`) kamera nie leci, tylko przeskakuje między etapami przez krótkie wyciemnienie. Ten tryb można podejrzeć, dopisując do adresu `?reduced-motion`.
- Bez WebGL strona wyświetla spokojne zielone tło, a cała treść i formularz nadal działają.

## Uruchomienie na swoim komputerze

```bash
npm install
npm run dev
```

Adres: **http://localhost:5173/greenart-3d/**

## Publikacja na GitHub Pages

1. Wypchnij repozytorium na GitHuba (gałąź `main`).
2. **Settings → Pages → Source: GitHub Actions**.
3. Workflow `.github/workflows/deploy.yml` buduje i publikuje stronę po każdym pushu.
4. Adres: `https://<twoje-konto>.github.io/greenart-3d/`. Przy innej nazwie repozytorium zmień `base` w `vite.config.ts`.

## Gdzie co zmienić

- **Teksty rozdziałów i kontakt:** `index.html`
- **Kształt drogi, położenie ogrodów, lot kamery:** `src/world/shape.ts` (tablica `CAM_KEYS`)
- **Pora dnia i kolory nieba dla każdego etapu:** `src/world/atmosphere.ts`
- **Rośliny i obiekty:** `src/world/props.ts` (kształty), `src/world/gen.worker.ts` (rozmieszczenie)
- **Formularz:** teraz otwiera program pocztowy (mailto). Żeby wysyłał wiadomości bezpośrednio, podłącz Web3Forms albo Formspree w `src/main.ts`.
- **Liczby w rozdziale III** są przykładowe (oznaczone na stronie jako demo).
