// Haalt de RVO-pagina "Stand van zaken elektrisch vervoer en laadpunten" op,
// leest de cijfers en de peildatum uit en schrijft data/data.json.
// Draait op Node 20+ zonder dependencies.

import { readFile, writeFile } from "node:fs/promises";

const BRON = "https://www.rvo.nl/onderwerpen/elektrisch-vervoer/stand-van-zaken";
const UIT = new URL("./docs/data.json", import.meta.url);

// Maximaal toegestane daling t.o.v. de vorige meting, als veiligheidscheck.
const MAX_DALING = 0.05;

export function naarTekst(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&rsquo;|&lsquo;|&apos;|&#39;|&#039;|&#8216;|&#8217;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/[\u2018\u2019\u02BC]/g, "'")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const getal = (s) => Number(s.replace(/\./g, ""));
const procent = (s) => Number(s.replace(",", "."));

function zoek(tekst, patroon, label) {
  const m = tekst.match(patroon);
  if (!m) throw new Error(`Niet gevonden op de RVO-pagina: ${label}`);
  return m;
}

export function parse(html) {
  const t = naarTekst(html);

  const peil = zoek(
    t,
    /op peildatum\s+([A-Za-zé]+)\s+(\d{4})/i,
    "peildatum"
  );

  const rij = (soort, labelWegen) => {
    const a = zoek(
      t,
      new RegExp(
        `elektrische ${soort} op de Nederlandse wegen is:\\s*([\\d.]+)`,
        "i"
      ),
      `aantal ${labelWegen}`
    );
    const p = zoek(
      t,
      new RegExp(
        `elektrische ${soort} op de Nederlandse wegen is:\\s*[\\d.]+\\s*Dit is\\s*([\\d,]+)%`,
        "i"
      ),
      `aandeel ${labelWegen}`
    );
    return { aantal: getal(a[1]), aandeel: procent(p[1]) };
  };

  const nieuw = (soort, label) => {
    const a = zoek(
      t,
      new RegExp(
        `nieuw verkochte elektrische ${soort} in (\\d{4}) is:\\s*([\\d.]+)`,
        "i"
      ),
      `nieuwverkoop ${label}`
    );
    const p = zoek(
      t,
      new RegExp(
        `nieuw verkochte elektrische ${soort} in \\d{4} is:\\s*[\\d.]+\\s*Dit is\\s*([\\d,]+)%`,
        "i"
      ),
      `nieuwverkoop-aandeel ${label}`
    );
    return { jaar: Number(a[1]), aantal: getal(a[2]), aandeel: procent(p[1]) };
  };

  return {
    peildatum: {
      maand: peil[1].toLowerCase(),
      jaar: Number(peil[2]),
      label: `${peil[1].toLowerCase()} ${peil[2]}`,
    },
    wagenpark: {
      personenautos: rij("personenauto's", "personenauto's"),
      lichteBedrijfsvoertuigen: rij(
        "lichte bedrijfsvoertuigen",
        "lichte bedrijfsvoertuigen"
      ),
      zwareBedrijfsvoertuigen: rij(
        "zware bedrijfsvoertuigen",
        "zware bedrijfsvoertuigen"
      ),
    },
    nieuwverkoop: {
      personenautos: nieuw("personenauto's", "personenauto's"),
      lichteBedrijfsvoertuigen: nieuw(
        "lichte bedrijfsvoertuigen",
        "lichte bedrijfsvoertuigen"
      ),
      zwareBedrijfsvoertuigen: nieuw(
        "zware bedrijfsvoertuigen",
        "zware bedrijfsvoertuigen"
      ),
    },
    bron: BRON,
    bijgewerkt: new Date().toISOString(),
  };
}

export function controleer(nieuwData, oudData) {
  const fouten = [];
  const paren = [
    ["wagenpark", "personenautos"],
    ["wagenpark", "lichteBedrijfsvoertuigen"],
    ["wagenpark", "zwareBedrijfsvoertuigen"],
  ];

  for (const [groep, sleutel] of paren) {
    const n = nieuwData[groep][sleutel].aantal;
    if (!Number.isFinite(n) || n <= 0) {
      fouten.push(`${sleutel}: onbruikbaar aantal (${n})`);
      continue;
    }
    const o = oudData?.[groep]?.[sleutel]?.aantal;
    if (o && n < o * (1 - MAX_DALING)) {
      fouten.push(
        `${sleutel}: daalt van ${o} naar ${n}, meer dan ${MAX_DALING * 100}%`
      );
    }
  }
  return fouten;
}

async function main() {
  const res = await fetch(BRON, {
    headers: { "user-agent": "SimpelDigitaal-RVO-bot" },
  });
  if (!res.ok) throw new Error(`RVO gaf status ${res.status}`);
  const html = await res.text();

  const nieuwData = parse(html);

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
  console.log("Bijgewerkt naar peildatum " + nieuwData.peildatum.label);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}
