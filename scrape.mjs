// Haalt de actuele cijfers over elektrische voertuigen op uit de databank van
// RVO (duurzamevoertuigen.databank.nl) en schrijft docs/data.json.
//
// Bron per categorie zijn dezelfde variabelen die de dashboards zelf gebruiken:
//   aantal   var=kb_wagenpark met dimmember voertuigsoort + aandrijflijn BEV
//   totaal   var=kb_wagenpark met alleen dimmember voertuigsoort
//   aandeel  var=wp_<categorie>_new_bev_tov_tot, inclusief de peildatum
//
// Draait op Node 20+ zonder dependencies.

import { readFile, writeFile } from "node:fs/promises";

const ENDPOINT =
    "https://duurzamevoertuigen.databank.nl/viewer/selectiontojson.ashx";
const BRON = "https://duurzamevoertuigen.databank.nl/mosaic/nl-nl/elektrisch-vervoer";
const UIT = new URL("./docs/data.json", import.meta.url);

// Grenzen voor de veiligheidscontroles.
const MAX_DALING = 0.05; // aantal mag niet meer dan 5% dalen
const MAX_STIJGING = 0.5; // en niet meer dan 50% stijgen
const MAX_AANDEEL_AFWIJKING = 0.3; // procentpunt tussen berekend en opgehaald aandeel

const CATEGORIEEN = [
  {
    sleutel: "personenautos",
    naam: "personenauto's",
    voertuigsoort: "dnc_voertuig_srt_pa",
    aandrijflijn: "dnc_aandrfln6cat_bev",
    aandeelVar: "wp_pa_new_bev_tov_tot",
  },
  {
    sleutel: "lichteBedrijfsvoertuigen",
    naam: "lichte bedrijfsvoertuigen",
    voertuigsoort: "dnc_voertuig_srt_lb",
    aandrijflijn: "dnc_aandrfln4cat_bev",
    aandeelVar: "wp_lb_new_bev_tov_tot",
  },
  {
    sleutel: "zwareBedrijfsvoertuigen",
    naam: "zware bedrijfsvoertuigen",
    voertuigsoort: "dnc_voertuig_srt_zb",
    aandrijflijn: "dnc_aandrfln4cat_bev",
    aandeelVar: "wp_zb_new_bev_tov_tot",
  },
];

const MAANDEN = [
  "januari",
  "februari",
  "maart",
  "april",
  "mei",
  "juni",
  "juli",
  "augustus",
  "september",
  "oktober",
  "november",
  "december",
];

// De databank weigert kale bot-verzoeken, dus we sturen dezelfde headers als
// een browser. Bij een netwerkfout proberen we het twee keer opnieuw.
const HEADERS = {
  "user-agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
  accept: "application/json, text/javascript, */*; q=0.01",
  "accept-language": "nl-NL,nl;q=0.9,en;q=0.8",
  referer:
    "https://duurzamevoertuigen.databank.nl/mosaic/nl-nl/elektrisch-vervoer/personenauto-s",
};

const wacht = (ms) => new Promise((r) => setTimeout(r, ms));

async function haal(params, poging = 1) {
  const url = `${ENDPOINT}?${params}&lang=nl-nl`;
  let res;
  try {
    res = await fetch(url, { headers: HEADERS, redirect: "follow" });
  } catch (e) {
    const oorzaak = e.cause ? ` (${e.cause.code || e.cause.message})` : "";
    if (poging < 3) {
      console.error(`Poging ${poging} mislukt${oorzaak}, opnieuw over 3 seconden`);
      await wacht(3000);
      return haal(params, poging + 1);
    }
    throw new Error(`Netwerkfout na ${poging} pogingen voor ${params}: ${e.message}${oorzaak}`);
  }
  if (!res.ok) throw new Error(`Databank gaf status ${res.status} voor ${params}`);
  const tekst = await res.text();
  let json;
  try {
    json = JSON.parse(tekst);
  } catch {
    throw new Error(
      `Geen geldige JSON voor ${params}, eerste tekens: ${tekst.slice(0, 80)}`
    );
  }
  if (!json || !Array.isArray(json.data) || !json.data.length) {
    throw new Error(`Lege respons voor ${params}`);
  }
  return json;
}

// De databank negeert een onbekende dimmember zonder foutmelding en geeft dan
// een ander (hoger) getal terug. Daarom controleren we of de gevraagde
// voertuigsoort echt in de respons staat.
function bevatCode(json, code) {
  return (json.dimensions || []).some((d) =>
    (d.items || []).some((i) => i.c === code)
  );
}

function waarde(json) {
  const cel = json.data[0][0];
  const n = Number(cel.v);
  if (!Number.isFinite(n)) throw new Error(`Onleesbare waarde: ${cel.v}`);
  return n;
}

function peildatumUit(json) {
  const dim = (json.dimensions || []).find((d) => d.type === "period");
  const item = dim && dim.items && dim.items[0];
  if (!item) throw new Error("Geen peildatum in de respons");
  const m = String(item.c).match(/^m(\d{1,2})y(\d{4})$/);
  if (!m) throw new Error(`Onbekende peildatumcode: ${item.c}`);
  const maandNr = Number(m[1]);
  const jaar = Number(m[2]);
  if (maandNr < 1 || maandNr > 12) throw new Error(`Onbekende maand: ${item.c}`);
  const maand = MAANDEN[maandNr - 1];
  return { maand, maandNr, jaar, label: `${maand} ${jaar}`, code: item.c };
}

export async function haalCategorie(cat) {
  const aantalJson = await haal(
    `var=kb_wagenpark&dimmember=${cat.voertuigsoort},${cat.aandrijflijn}`
  );
  const totaalJson = await haal(
    `var=kb_wagenpark&dimmember=${cat.voertuigsoort}`
  );
  const aandeelJson = await haal(`var=${cat.aandeelVar}`);

  for (const [json, label] of [
    [aantalJson, "aantal"],
    [totaalJson, "totaal"],
  ]) {
    if (!bevatCode(json, cat.voertuigsoort)) {
      throw new Error(
        `${cat.naam}: voertuigsoort ${cat.voertuigsoort} niet herkend in de ${label}-respons`
      );
    }
  }

  const aantal = waarde(aantalJson);
  const totaal = waarde(totaalJson);
  const aandeel = waarde(aandeelJson);
  const peildatum = peildatumUit(aandeelJson);

  if (aantal <= 0) throw new Error(`${cat.naam}: aantal is ${aantal}`);
  if (totaal <= aantal) {
    throw new Error(
      `${cat.naam}: aantal ${aantal} is niet kleiner dan het totale wagenpark ${totaal}, de aandrijflijnfilter lijkt genegeerd`
    );
  }

  // Kruiscontrole: het zelf berekende aandeel moet overeenkomen met het
  // opgehaalde aandeel. Wijkt het af, dan is er iets mis met een van de drie
  // opvragingen en publiceren we niets.
  const berekend = (aantal / totaal) * 100;
  if (Math.abs(berekend - aandeel) > MAX_AANDEEL_AFWIJKING) {
    throw new Error(
      `${cat.naam}: berekend aandeel ${berekend.toFixed(2)}% wijkt af van opgehaald aandeel ${aandeel.toFixed(2)}%`
    );
  }

  return {
    sleutel: cat.sleutel,
    peildatum,
    cijfers: {
      aantal,
      aandeel: Math.round(aandeel * 10) / 10,
      totaalWagenpark: totaal,
    },
  };
}

export function controleer(nieuwData, oudData) {
  const fouten = [];
  for (const cat of CATEGORIEEN) {
    const n = nieuwData.wagenpark[cat.sleutel].aantal;
    const o = oudData?.wagenpark?.[cat.sleutel]?.aantal;
    if (!o) continue;
    if (n < o * (1 - MAX_DALING)) {
      fouten.push(`${cat.naam}: daalt van ${o} naar ${n}`);
    }
    if (n > o * (1 + MAX_STIJGING)) {
      fouten.push(`${cat.naam}: stijgt van ${o} naar ${n}`);
    }
  }
  return fouten;
}

async function main() {
  const resultaten = [];
  for (const cat of CATEGORIEEN) {
    resultaten.push(await haalCategorie(cat));
  }

  // Alle categorieen horen dezelfde peildatum te hebben.
  const codes = [...new Set(resultaten.map((r) => r.peildatum.code))];
  if (codes.length !== 1) {
    throw new Error(`Categorieen hebben verschillende peildatums: ${codes.join(", ")}`);
  }

  const nieuwData = {
    peildatum: {
      maand: resultaten[0].peildatum.maand,
      jaar: resultaten[0].peildatum.jaar,
      label: resultaten[0].peildatum.label,
      code: resultaten[0].peildatum.code,
    },
    wagenpark: Object.fromEntries(
      resultaten.map((r) => [r.sleutel, r.cijfers])
    ),
    bron: BRON,
    bijgewerkt: new Date().toISOString(),
  };

  let oudData = null;
  try {
    oudData = JSON.parse(await readFile(UIT, "utf8"));
  } catch {}

  const fouten = controleer(nieuwData, oudData);
  if (fouten.length) {
    console.error("Controle mislukt, bestand niet bijgewerkt:");
    for (const f of fouten) console.error(" - " + f);
    process.exit(1);
  }

  if (oudData) {
    const zelfde =
      JSON.stringify({ ...oudData, bijgewerkt: null }) ===
      JSON.stringify({ ...nieuwData, bijgewerkt: null });
    if (zelfde) {
      console.log("Geen wijziging, peildatum is nog " + oudData.peildatum.label);
      return;
    }
  }

  await writeFile(UIT, JSON.stringify(nieuwData, null, 2) + "\n");
  console.log(
    "Bijgewerkt naar peildatum " +
      nieuwData.peildatum.label +
      ": " +
      CATEGORIEEN.map(
        (c) =>
          `${c.naam} ${nieuwData.wagenpark[c.sleutel].aantal} (${nieuwData.wagenpark[c.sleutel].aandeel}%)`
      ).join(", ")
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(e.message);
    if (e.cause) console.error("Oorzaak:", e.cause.code || e.cause.message);
    process.exit(1);
  });
}
