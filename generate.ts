import { xml2js } from 'xml-js';
import fs from 'node:fs';
import { join, relative } from 'node:path';
import { spawn } from 'node:child_process';

const PROJECT_NAME = "quick-access";
const SITES_XML = "sites.xml";
const REQUIRED_NS = "files.galacticsystemsindevelopment.xyz/xml_namespace/transport";


async function setup() {
    console.log("🚀 Creating Hono project...");
    spawn('bun', ['create', 'hono@latest', PROJECT_NAME, '--template', 'bun', '--pm', 'bun', '--install'], { stdio: 'inherit' })
        .on('close', () => {
            console.log("🧹 Injecting custom server...");
            const filesDir = join(process.cwd(), PROJECT_NAME, 'files');
            if (!fs.existsSync(filesDir)) fs.mkdirSync(filesDir, { recursive: true });
            fs.copyFileSync('index.ts', join(PROJECT_NAME, 'src', 'index.ts'));

            startBackgroundWatcher(filesDir);
            startServer();
        });
}

function syncAll(filesDir: string) {
    try {
        const xml = fs.readFileSync(SITES_XML, 'utf8');
        const config = xml2js(xml, { compact: true }) as any;
        // Extract the xmlns attribute from the <transport> root tag
        const currentNs = config.transport?._attributes?.xmlns;

        if (currentNs !== REQUIRED_NS) {
            console.error("====================================================");
            console.error("CRITICAL ERROR: UNAUTHORIZED TRANSPORT NAMESPACE!");
            console.error(`Received: ${currentNs || "None"}`);
            console.error(`Required: ${REQUIRED_NS}`);
            console.error("====================================================");
            process.exit(1); // Force the program to crash/exit
        }
        const root = config.transport;
        
        const activePaths = new Set<string>();
        activePaths.add('index.xhtml');

        function processNode(node: any, currentDir: string, relPath: string) {
            if (!fs.existsSync(currentDir)) fs.mkdirSync(currentDir, { recursive: true });

            // Process Folders
            const folders = Array.isArray(node.folder) ? node.folder : (node.folder ? [node.folder] : []);
            folders.forEach((f: any) => {
                const folderName = f._attributes.name;
                processNode(f, join(currentDir, folderName), join(relPath, folderName));
            });

            // Process Sites
            const sites = Array.isArray(node.site) ? node.site : (node.site ? [node.site] : []);
            sites.forEach((site: any) => {
                const id = site._attributes.id;
                const url = site._text;
                const fileName = `${id}.xhtml`;
                activePaths.add(join(relPath, fileName));

                const xhtml = `<?xml version="1.0" encoding="UTF-8"?>
                <!DOCTYPE html>
                <html xmlns="http://www.w3.org/1999/xhtml" xml:lang="en" lang="en">
<head><title>Transport: ${id}</title><script type="text/javascript">//<![CDATA[
window.location.href="${url}";//]]></script></head>
<body><p>Transporting to <a href="${url}">${id}</a>...</p></body></html>`;
                
                fs.writeFileSync(join(currentDir, fileName), xhtml);
            });

            // Generate index for this directory
            const idxXhtml = `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org"><head><title>Index</title></head>
<body><h1>Transport Index</h1><p>Welcome to your quick transport directory. Manage your sites in sites.xml</body></html>`;
            fs.writeFileSync(join(currentDir, 'index.xhtml'), idxXhtml);
        }

        processNode(root, filesDir, "");

        // Cleanup: Recursive delete for obsolete files
        const cleanup = (dir: string, rel: string) => {
            fs.readdirSync(dir, { withFileTypes: true }).forEach(dirent => {
                const full = join(dir, dirent.name);
                const currentRel = join(rel, dirent.name);
                if (dirent.isDirectory()) {
                    cleanup(full, currentRel);
                    if (fs.readdirSync(full).length === 0) fs.rmdirSync(full);
                } else if (!activePaths.has(currentRel)) {
                    fs.unlinkSync(full);
                    console.log(`🗑️ Deleted: ${currentRel}`);
                }
            });
        };
        cleanup(filesDir, "");

        console.log(`✨ Synced at ${new Date().toLocaleTimeString()}`);
    } catch (e) { console.error("❌ Sync Error:", e.message); }
}

function startBackgroundWatcher(filesDir: string) {
    syncAll(filesDir);
    fs.watch(SITES_XML, (event) => { if (event === 'change') syncAll(filesDir); });
}

function startServer() {
    spawn('bun', ['run', 'src/index.ts'], { cwd: PROJECT_NAME, stdio: 'inherit' });
}

setup();
