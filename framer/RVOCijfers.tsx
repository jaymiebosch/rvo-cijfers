import { addPropertyControls, ControlType } from "framer"
import { useEffect, useState } from "react"

// Laatst bekende waarden. Deze staan in de component zodat er altijd iets
// zichtbaar is, ook als de feed even niet bereikbaar is.
const FALLBACK = {
    peildatum: { maand: "juni", jaar: 2026, label: "juni 2026" },
    wagenpark: {
        personenautos: { aantal: 745389, aandeel: 8.0 },
        lichteBedrijfsvoertuigen: { aantal: 62025, aandeel: 5.9 },
        zwareBedrijfsvoertuigen: { aantal: 2870, aandeel: 1.7 },
    },
    nieuwverkoop: {
        personenautos: { jaar: 2026, aantal: 63037, aandeel: 37 },
        lichteBedrijfsvoertuigen: { jaar: 2026, aantal: 8863, aandeel: 80 },
        zwareBedrijfsvoertuigen: { jaar: 2026, aantal: 740, aandeel: 9 },
    },
}

const nl = new Intl.NumberFormat("nl-NL")
const pct = (n: number) =>
    new Intl.NumberFormat("nl-NL", { maximumFractionDigits: 1 }).format(n) + "%"

function velden(d: typeof FALLBACK) {
    return {
        maand: d.peildatum.maand,
        jaar: String(d.peildatum.jaar),
        peildatum: d.peildatum.label,
        personenautos: nl.format(d.wagenpark.personenautos.aantal),
        aandeelPersonenautos: pct(d.wagenpark.personenautos.aandeel),
        lichteBedrijfsvoertuigen: nl.format(
            d.wagenpark.lichteBedrijfsvoertuigen.aantal
        ),
        aandeelLichte: pct(d.wagenpark.lichteBedrijfsvoertuigen.aandeel),
        zwareBedrijfsvoertuigen: nl.format(
            d.wagenpark.zwareBedrijfsvoertuigen.aantal
        ),
        aandeelZware: pct(d.wagenpark.zwareBedrijfsvoertuigen.aandeel),
        nieuwJaar: String(d.nieuwverkoop.personenautos.jaar),
        nieuwPersonenautos: nl.format(d.nieuwverkoop.personenautos.aantal),
        aandeelNieuwPersonenautos: pct(d.nieuwverkoop.personenautos.aandeel),
        nieuwLichte: nl.format(d.nieuwverkoop.lichteBedrijfsvoertuigen.aantal),
        aandeelNieuwLichte: pct(d.nieuwverkoop.lichteBedrijfsvoertuigen.aandeel),
        nieuwZware: nl.format(d.nieuwverkoop.zwareBedrijfsvoertuigen.aantal),
        aandeelNieuwZware: pct(d.nieuwverkoop.zwareBedrijfsvoertuigen.aandeel),
    }
}

function vul(sjabloon: string, data: typeof FALLBACK) {
    const v = velden(data)
    return sjabloon.replace(/\{(\w+)\}/g, (heel, sleutel) =>
        sleutel in v ? v[sleutel as keyof typeof v] : heel
    )
}

/**
 * Toont de actuele RVO-cijfers over elektrisch vervoer.
 *
 * @framerSupportedLayoutWidth any-prefer-fixed
 * @framerSupportedLayoutHeight auto
 */
export default function RVOCijfers(props) {
    const { url, sjabloon, font, kleur, uitlijning, style } = props
    const [data, setData] = useState(FALLBACK)

    useEffect(() => {
        if (!url) return
        let actief = true
        fetch(url)
            .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
            .then((d) => {
                if (actief && d?.peildatum?.label) setData(d)
            })
            .catch(() => {
                // Stil falen: de laatst bekende waarden blijven staan.
            })
        return () => {
            actief = false
        }
    }, [url])

    return (
        <div
            style={{
                ...style,
                ...font,
                color: kleur,
                textAlign: uitlijning,
                whiteSpace: "pre-wrap",
            }}
        >
            {vul(sjabloon, data)}
        </div>
    )
}

RVOCijfers.defaultProps = {
    url: "https://GEBRUIKERSNAAM.github.io/REPONAAM/data.json",
    sjabloon:
        "In {maand} {jaar} reden er {personenautos} elektrische personenauto's in Nederland, {aandeelPersonenautos} van het totale wagenpark.",
    kleur: "#111111",
    uitlijning: "left",
}

addPropertyControls(RVOCijfers, {
    url: {
        type: ControlType.String,
        title: "Data-URL",
        description: "De data.json uit de GitHub-repo.",
    },
    sjabloon: {
        type: ControlType.String,
        title: "Tekst",
        displayTextArea: true,
        description:
            "Gebruik {maand}, {jaar}, {personenautos}, {aandeelPersonenautos}, {lichteBedrijfsvoertuigen}, {aandeelLichte}, {zwareBedrijfsvoertuigen}, {aandeelZware}, {nieuwJaar}, {nieuwPersonenautos}, {aandeelNieuwPersonenautos}, {nieuwLichte}, {aandeelNieuwLichte}, {nieuwZware}, {aandeelNieuwZware}.",
    },
    font: {
        type: ControlType.Font,
        title: "Tekststijl",
        controls: "extended",
        defaultFontType: "sans-serif",
        defaultValue: { fontSize: 16, lineHeight: "1.5em" },
    },
    kleur: { type: ControlType.Color, title: "Kleur" },
    uitlijning: {
        type: ControlType.Enum,
        title: "Uitlijning",
        options: ["left", "center", "right"],
        optionTitles: ["Links", "Midden", "Rechts"],
        displaySegmentedControl: true,
    },
})
