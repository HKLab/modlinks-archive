import axios from "axios";
import { createHash } from "crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from "fs";
import extra from "fs-extra";
import { join, parse } from "path";
import { URL } from "url";
import { ModCollection, ModFileRecord, ModLinksManifestData } from "./types.js";
import { zip } from "compressing";


const modlinks = extra.readJSONSync("modlinks.json") as ModCollection;
const timeout = setTimeout(() => {
    console.log("Timeout");
    process.exit();
}, 1000 * 60 * 15);


for (const key in modlinks.mods) {
    const mod = modlinks.mods[key];
    for (const ver in mod) {
        const el = mod[ver];
        let rec = el.ei_files;
        if (rec || !el.link) continue;

        rec = {
            link: el.link
        };
        
        try {
            const url = new URL(el.link);
            const p = parse(url.pathname);
            console.log(`New mod: ${key} (v${ver}) = ${el.link}`);
            const content = Buffer.from((await axios.get<ArrayBuffer>(el.link, {
                responseType: 'arraybuffer'
            })).data);
            rec.size = content.length;
            rec.sha256 = createHash('sha256').update(content).digest('hex');
            if (p.ext !== '.dll') {
                const dir = "tmp";
                if (!existsSync(dir)) mkdirSync(dir);
                await zip.uncompress(content, "tmp");
                function forEachFiles(root: string, path: string, rec: ModFileRecord) {
                    for (const file of readdirSync(root)) {
                        const rf = join(root, file);
                        const f = statSync(rf);
                        if (f.isFile()) {
                            rec.files ??= {};
                            rec.files[join(path, file)] = createHash('sha256').update(readFileSync(rf)).digest('hex');
                        } else if (f.isDirectory()) {
                            forEachFiles(rf, join(path, file), rec);
                        }
                    }
                }
                forEachFiles(dir, "", rec);
                rmSync(dir, {
                    recursive: true
                });
            } else {
                rec.files = {
                    [el.name + ".dll"]: createHash('sha256').update(content).digest('hex')
                };
            }
            el.ei_files = rec;
            extra.writeJSONSync("modlinks.json", modlinks, {
                spaces: 4
            });
        } catch (e) {
            if(el.isDeleted) {
                rec.noSource = true;
                el.ei_files = rec;
                extra.writeJSONSync("modlinks.json", modlinks, {
                    spaces: 4
                });
            }
            console.error(e);
        }
    }
}
clearTimeout(timeout);
