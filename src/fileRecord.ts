import axios from "axios";
import { createHash } from "crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from "fs";
import extra from "fs-extra";
import { join, parse } from "path";
import { URL } from "url";
import { ModCollection, ModLinksManifestData } from "./modlinks";
import { zip } from "compressing";

export interface ModFileRecord {
    name: string;
    version: string;
    files?: Record<string, string>;
    link: string;
    size?: number;
    modinfo: ModLinksManifestData;
}

export type ModFileRecordCollection = Record<string, Record<string, ModFileRecord>>;

const modlinks = extra.readJSONSync("modlinks.json") as ModCollection;
const timeout = setTimeout(() => {
    console.log("Timeout");
    process.exit();
}, 1000 * 60 * 15);

let record: ModFileRecordCollection = {};
if (existsSync("filerecords.json")) {
    record = extra.readJSONSync("filerecords.json") as ModFileRecordCollection;
}

for (const key in modlinks.mods) {
    const mod = modlinks.mods[key];
    let modrecord = record[key];
    if (!modrecord) {
        modrecord = record[key] = {};
    }
    for (const ver in mod) {
        const el = mod[ver];
        let rec = modrecord[ver];
        if (rec || !el.link) continue;

        rec = {
            name: key,
            version: ver,
            link: el.link,
            modinfo: el
        };
        try {
            const url = new URL(el.link);
            const p = parse(url.pathname);
            console.log(`New mod: ${key} (v${ver}) = ${el.link}`);
            const content = Buffer.from((await axios.get<ArrayBuffer>(el.link, {
                responseType: 'arraybuffer'
            })).data);
            rec.size = content.length;
            if (p.ext !== '.dll') {
                const dir = "tmp";
                if (!existsSync(dir)) mkdirSync(dir);
                await zip.uncompress(content, "tmp");
                function forEachFiles(root: string, path: string) {
                    for (const file of readdirSync(root)) {
                        const rf = join(root, file);
                        const f = statSync(rf);
                        if (f.isFile()) {
                            rec.files ??= {};
                            rec.files[join(path, file)] = createHash('sha256').update(readFileSync(rf)).digest('hex');
                        } else if (f.isDirectory()) {
                            forEachFiles(rf, join(path, file));
                        }
                    }
                }
                forEachFiles(dir, "");
                rmSync(dir, {
                    recursive: true
                });
            } else {
                rec.files = {
                    [el.name + ".dll"]: createHash('sha256').update(content).digest('hex')
                };
            }
            modrecord[ver] = rec;
            extra.writeJSONSync("filerecords.json", record, {
                spaces: 4
            });
        } catch (e) {
            console.error(e);
        }
    }
}

clearTimeout(timeout);
