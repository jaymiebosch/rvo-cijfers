# RVO-cijfers automatisch op de site

Haalt maandelijks de cijfers over elektrisch vervoer van RVO op en publiceert ze als JSON. De Framer-site leest die JSON uit, dus de cijfers en de maandnaam updaten zichzelf.

Bron: https://www.rvo.nl/onderwerpen/elektrisch-vervoer/stand-van-zaken

## Inhoud

- `scrape.mjs` haalt de pagina op, leest de peildatum en zes cijfers uit en schrijft `docs/data.json`
- `.github/workflows/update-rvo.yml` draait het script dagelijks en commit alleen bij een wijziging
- `docs/data.json` de feed die de website uitleest
- `framer/RVOCijfers.tsx` de code component voor Framer

## Instellen (eenmalig)

1. Maak een repo aan, bijvoorbeeld `rvo-cijfers`, en zet deze bestanden erin.
2. Ga naar Settings, Pages. Kies Source: Deploy from a branch, branch `main`, map `/docs`. De feed staat daarna op `https://GEBRUIKERSNAAM.github.io/rvo-cijfers/data.json`.
3. Ga naar Actions en draai de workflow eenmalig met Run workflow om te controleren dat alles werkt.
4. In Framer: Assets, Code, New Code File, plak `RVOCijfers.tsx`. Sleep de component op de pagina waar nu de vaste tekst staat.
5. Zet in het paneel de Data-URL op de Pages-URL uit stap 2 en pas het sjabloon aan naar de tekst die Michael nu op de site heeft staan.

## Sjabloon

De tekst in het paneel werkt met plaatshouders, bijvoorbeeld:

```
In {maand} {jaar} reden er {personenautos} elektrische personenauto's in Nederland, {aandeelPersonenautos} van het totale wagenpark.
```

Beschikbaar: `{maand}` `{jaar}` `{peildatum}` `{personenautos}` `{aandeelPersonenautos}` `{lichteBedrijfsvoertuigen}` `{aandeelLichte}` `{zwareBedrijfsvoertuigen}` `{aandeelZware}` `{nieuwJaar}` `{nieuwPersonenautos}` `{aandeelNieuwPersonenautos}` `{nieuwLichte}` `{aandeelNieuwLichte}` `{nieuwZware}` `{aandeelNieuwZware}`.

## Als er iets misgaat

Het script stopt met een foutmelding als een cijfer ontbreekt of als een aantal meer dan 5% daalt ten opzichte van de vorige meting. `docs/data.json` wordt dan niet overschreven en GitHub mailt je dat de workflow is gefaald. De site blijft ondertussen de laatst bekende cijfers tonen. Verandert RVO de opmaak van de pagina, dan pas je de regex in `scrape.mjs` aan.

De component heeft de laatst bekende waarden ook hardcoded als terugval, zodat er nooit een leeg blok op de site staat.
