// Cloudflare Worker die de RVO-databank ophaalt en doorgeeft.
// Nodig omdat de databank verkeer vanaf GitHub-servers weigert.
//
// Gebruik: https://<jouw-worker>.workers.dev/?var=...&dimmember=...
// De worker zet er CORS op en cachet het antwoord zes uur.

const TOEGESTAAN = "https://duurzamevoertuigen.databank.nl/viewer/selectiontojson.ashx";

export default {
    async fetch(request) {
        const inkomend = new URL(request.url);

        if (request.method === "OPTIONS") {
            return new Response(null, { headers: cors() });
        }

        // Alleen de parameters doorgeven, nooit een vrij in te vullen doel-URL.
        const doel = new URL(TOEGESTAAN);
        for (const [k, v] of inkomend.searchParams) {
            if (["var", "dimmember", "lang"].includes(k)) {
                doel.searchParams.set(k, v);
            }
        }
        if (!doel.searchParams.get("var")) {
            return new Response(JSON.stringify({ fout: "parameter var ontbreekt" }), {
                status: 400,
                headers: { ...cors(), "content-type": "application/json" },
            });
        }

        const antwoord = await fetch(doel.toString(), {
            headers: {
                "user-agent":
                    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
                accept: "application/json, text/javascript, */*; q=0.01",
                "accept-language": "nl-NL,nl;q=0.9",
                referer:
                    "https://duurzamevoertuigen.databank.nl/mosaic/nl-nl/elektrisch-vervoer/personenauto-s",
            },
            cf: { cacheTtl: 21600, cacheEverything: true },
        });

        const tekst = await antwoord.text();
        return new Response(tekst, {
            status: antwoord.status,
            headers: {
                ...cors(),
                "content-type": "application/json; charset=utf-8",
                "cache-control": "public, max-age=21600",
            },
        });
    },
};

function cors() {
    return {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "GET, OPTIONS",
    };
}
