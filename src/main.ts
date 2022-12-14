
import extra from 'fs-extra'
import axios, { AxiosRequestHeaders } from 'axios';
import { ModLinksData, ModLinksManifestData, parseModLinks } from './modlinks.js';
import { existsSync } from 'fs';

function getJsonPath() {
    return 'modlinks.json';
}

interface CommitInfo {
    sha: string;
    commit: {
        author: {
            date: string;
            name: string;
            email: string;
        };
        tree: {
            url: string;
        };
    }
}

interface TreeInfo {
    tree: {
        path: string;
        url: string;
    }[];
}

interface FileContent {
    content: string
}

interface ModCollection {
    mods: Record<string, ModVersionCollection>;
    latestCommit?: string;
}

type ModVersionCollection = Record<string, ModLinksManifestData>;

//process.exit();
const token = process.env.GH_TOKEN;
if (token) {
    axios.defaults.headers.common['Authorization'] = `token ${token}`;
} else {
    console.error('Require GH_TOKEN');
    process.abort();
}


let allCommits: CommitInfo[] = [];
type ModLinksResult = { data: ModLinksData, commit: CommitInfo } | string;

let modrecord: ModCollection = {
    mods: {}
};

if (existsSync(getJsonPath())) {
    modrecord = extra.readJSONSync(getJsonPath());
    console.log('Has cache');
}


let page = 0;
let breakGet = false;
let rate = 5000;
let resetTime = 0;


let endCommit = modrecord.latestCommit ?? '1a7399ead20a40c363091a5f0afea8be923f5ea8';
if(process.env.MODLINK_FULL) {
    endCommit = '1a7399ead20a40c363091a5f0afea8be923f5ea8';
}

console.log(`Fetch commits`);
while (!breakGet && (allCommits.length < 30 || process.env.MODLINK_FULL)) {
    const result = await axios.get<CommitInfo[]>(`https://api.github.com/repos/hk-modding/modlinks/commits?page=${page}&per_page=30`);
    const header = result.headers as AxiosRequestHeaders;
    rate = Number.parseInt(header.get('x-ratelimit-remaining', undefined)?.toString() ?? '0')
    resetTime = Number.parseInt(header.get('x-ratelimit-reset', undefined)?.toString() ?? '0')
    const req = result.data;
    if (req.length == 0) break;
    page++;
    for (const commit of req) {
        if (commit.sha === endCommit) {
            breakGet = true;
            break;
        }
        allCommits.push(commit);
    }
}
console.log(`x-ratelimit-reset: ${new Date(resetTime * 1000).toLocaleString()} ${resetTime}`);
console.log(`x-ratelimit-remaining: ${rate}`);
console.log(`Total commits: ${allCommits.length} ${page}`);

await (async function () {
    if (allCommits.length == 0) {
        console.log('Nothing can do');
        return;
    }

    console.log(`Fetch ModLinks`);

    const modlinks: (ModLinksResult | Promise<ModLinksResult>)[] = [];
    modlinks.length = allCommits.length;

    async function fetchCommit(cid: number, commit: CommitInfo) {
        if (!commit) return 'Null Commit';
        const r = modlinks[cid];
        if (r) {
            if (r instanceof Promise) return await r;
            return r;
        }
        return await (modlinks[cid] = (async function (id) {
            try {
                const tree = (await axios.get<TreeInfo>(commit.commit.tree.url)).data;
                const ml = tree.tree.find(x => x.path.toLowerCase() == 'modlinks.xml');
                if (!ml) throw `Not found modlinks.xml in ${commit.sha}`;
                const content = Buffer.from((await axios.get<FileContent>(ml.url)).data.content, 'base64').toString('utf-8');
                const result = modlinks[id] = {
                    data: await parseModLinks(content),
                    commit: commit
                };
                //Find Next
                let n_id = modlinks.findIndex(x => x == undefined);
                if (n_id > 0 && n_id < allCommits.length && allCommits[n_id]) {
                    fetchCommit(n_id, allCommits[n_id]);
                }
                return result;
            } catch (e) {
                console.log(e);
                modlinks[id] = e.toString();
                return modlinks[id];
            }
        })(cid));
    }

    for (let i = 0; i < 20; i++) {
        fetchCommit(i, allCommits[i]);
    }

    function setDeleted(ver: ModVersionCollection) {
        for (const key in ver) {
            const v = ver[key];
            v.isDeleted = true;
        }
    }

    let missing = 0;
    for (let i = 0; i < allCommits.length; i++) {
        let result: ModLinksResult = await fetchCommit(i, allCommits[i]);
        if (typeof result == 'string') {
            missing++;
            continue;
        }
        const { data, commit } = result;
        const mods = data.mods;
        for (const mod of mods) {
            let mvs = modrecord.mods[mod.name];
            let isFirst = false;
            if (!mvs) {
                modrecord.mods[mod.name] = mvs = {};
            }
            if (!mvs[mod.version]) {
                isFirst = true;
                mvs[mod.version] = mod;
                if (i > 0) {
                    console.log(`[Mod]${mod.name} - ${mod.version}`);
                }
            }
            const m = mvs[mod.version];
            if(isFirst || process.env.MODLINK_FULL) {
                m.date = commit.commit.author.date;
            }
            
        }
        if (i == 0) {
            modrecord.latestCommit = commit.sha;
            for (const key in modrecord.mods) {
                if (mods.findIndex(x => x.name == key) == -1) {
                    console.log(`A mod that has been removed: ${key}`)
                    setDeleted(modrecord.mods[key]);
                }
            }
        }
        if (i % 50 == 0) {
            extra.outputJSONSync(getJsonPath(), modrecord, {
                spaces: 4
            });
        }
        console.log(`(${i++})${commit.commit.author.date} '${commit.commit.author.name}' ${commit.sha}`);
    }
    console.log(`${missing} is missing`);
    extra.outputJSONSync(getJsonPath(), modrecord, {
        spaces: 4
    });

})();



