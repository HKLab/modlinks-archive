
import { Parser, ast } from 'tsxml'
import { ModLinksData, ModLinksManifestData, currentPlatform, ModTag } from './types';

type ContainerNode = ast.ContainerNode<ast.Node>;
type TextNode = ast.TextNode;
type CDataNode = ast.CDataSectionNode;


function findXmlNode<T = Node>(parent: ContainerNode, tagName: string): T | undefined {
    return (parent.childNodes.find(x => x.tagName === tagName) as (T | undefined));
}

function getXmlNodeText(parent: ContainerNode, tagName: string): string | undefined {
    return (findXmlNode<ContainerNode>(parent, tagName)?.childNodes[0] as (TextNode | undefined))?.content;
}

function getCDATANodeText(parent: ContainerNode, tagName: string): string | undefined {
    return (findXmlNode<ContainerNode>(parent, tagName)?.childNodes[0] as (CDataNode | undefined))?.content;
}

export async function parseModLinks(content: string): Promise<ModLinksData> {
    const result = new ModLinksData();
    const xml = await Parser.parseString(content);
    const root = xml.getAst().childNodes[1] as ContainerNode;
    if (!root) throw 0;
    for (let i = 0; i < root.childNodes.length; i++) {
        const node = root.childNodes[i];
        if (node instanceof ast.CommentNode) continue;
        const manifest = node as ContainerNode;
        const mod: ModLinksManifestData = {
            name: "",
            desc: "",
            version: "",
            link: "",
            dependencies: [],
            repository: "",
            integrations: [],
            tags: [],
            authors: []
        };
        mod.name = getXmlNodeText(manifest, "Name") ?? "";
        mod.desc = getXmlNodeText(manifest, "Description") ?? "";
        mod.version = getXmlNodeText(manifest, "Version") ?? "";
        let tlink = getCDATANodeText(manifest, "Link");
        if (!tlink) {
            const nlinks = findXmlNode<ContainerNode>(manifest, "Links");
            tlink = nlinks ? getCDATANodeText(nlinks, currentPlatform) : undefined;
            if (!tlink) continue;
        }
        mod.link = tlink;

        const depNode = findXmlNode<ContainerNode>(manifest, "Dependencies");
        if (depNode && !(depNode instanceof ast.SelfClosingNode)) {
            for (let i2 = 0; i2 < depNode.childNodes.length; i2++) {
                const dep = (depNode.childNodes[i2] as ContainerNode).childNodes[0] as TextNode;
                mod.dependencies.push(dep.content);
            }
        }

        mod.repository = getCDATANodeText(manifest, "Repository");
        if(!mod.repository) {
            const url = new URL(tlink);
            if(url.hostname == 'github.com') {
                url.pathname = url.pathname.substring(0, url.pathname.indexOf('/releases/download/'));
                mod.repository = url.toString();
            }
            
        }

        const integrationsNode = findXmlNode<ContainerNode>(manifest, "Integrations");
        if (integrationsNode) {
            for (let i2 = 0; i2 < integrationsNode.childNodes.length; i2++) {
                const integration = (integrationsNode.childNodes[i2] as ContainerNode).childNodes[0] as TextNode;
                mod.integrations.push(integration.content);
            }
        }

        const tagsNode = findXmlNode<ContainerNode>(manifest, "Tags");
        if (tagsNode) {
            for (let i2 = 0; i2 < tagsNode.childNodes.length; i2++) {
                const tag = (tagsNode.childNodes[i2] as ContainerNode).childNodes[0] as TextNode;
                mod.tags.push(tag.content as ModTag);
            }
        }

        const authorsNode = findXmlNode<ContainerNode>(manifest, "Authors");
        if (authorsNode) {
            for (let i2 = 0; i2 < authorsNode.childNodes.length; i2++) {
                const author = (authorsNode.childNodes[i2] as ContainerNode).childNodes[0] as TextNode;
                mod.authors.push(author.content as ModTag);
            }
        }

        result.mods.push(mod);
    }
    result.mods.sort((a, b) => a.name.localeCompare(b.name));
    return result;
}
