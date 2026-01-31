import { Hono } from 'hono';
import { logger } from 'hono/logger';
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import archiver from 'archiver';

const app2 = new Hono();

const staticDirPath = "./files"; 


app2.use(logger());
// XHTML MIME Type Middleware
app2.use('*', async (c, next) => {
  await next();
  if (c.req.path.endsWith('.xhtml')) {
    c.res.headers.set('Content-Type', 'application/xhtml+xml');
  }
});


app2.get('/*', async (c) => {
  const urlPath = c.req.path;
  const fullPath = path.join(staticDirPath, urlPath);
  
  // FIXED: Moved query parsing to the top, but used correctly
  const noIndex = c.req.query('no-index') !== undefined;
  const noListing = c.req.query('no-listing') !== undefined;
  const isZipDownload = c.req.query('download') === 'zip';
  const passOn = c.req.query('pass-on') !== undefined;

  // 1. Check if path exists
  if (!fs.existsSync(fullPath)) {
    
      return c.text("404 Not Found", 404);
    
  }
  
  const stats = fs.lstatSync(fullPath);

  // 2. ZIP DOWNLOAD LOGIC (Updated for Bun/Hono Stream Compatibility)
  if (stats.isDirectory() && isZipDownload) {
    const folderName = path.basename(fullPath) || 'root';
    const archive = archiver('zip', { zlib: { level: 5 } });
    
    // Bun requires a Web Stream; we pipe the Node archive stream through a TransformStream
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();

    archive.on('data', (chunk) => writer.write(chunk));
    archive.on('end', () => writer.close());
    archive.on('error', (err) => writer.abort(err));

    archive.directory(fullPath, false);
    archive.finalize();

    return c.body(readable, 200, {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${folderName}.zip"`,
    });
  }

  // 3. FILE SERVING
  if (stats.isFile()) {
    const file = Bun.file(fullPath);
    return c.body(file.stream(), 200, {
      'Content-Type': file.type || 'application/octet-stream',
      'Content-Length': stats.size.toString(),
    });
  }
  // ... (Keep existing imports and setup)
  
    // 4. DIRECTORY HANDLING
    if (stats.isDirectory()) {
      if (!urlPath.endsWith('/')) return c.redirect(urlPath + '/', 301);
  
      let indexContent = "";
      let listingContent = "";
  
      const indexPath = path.join(fullPath, "index.xhtml");
      if (!noIndex && fs.existsSync(indexPath)) {
        indexContent = await Bun.file(indexPath).text();
      }
  
      if (!noListing) {
        const params = new URLSearchParams();
        if (passOn) params.set('pass-on', '');
        if (noIndex) params.set('no-index', '');
        if (noListing) params.set('no-listing', '');
        
        let inheritedQueryString = "";
        if (passOn) {
          inheritedQueryString = params.toString() ? "?" + params.toString().replace(/&/g, '&amp;') : "";
        }
  
        const files = fs.readdirSync(fullPath);
        const items = files
          .map((fileName) => {
            const itemFullPath = path.join(fullPath, fileName);
            const isDir = fs.lstatSync(itemFullPath).isDirectory();
            const link = (path.join(urlPath, fileName) + (isDir ? '/' : '') + inheritedQueryString).replace(/&/g, '&amp;');
            
            if (isDir) {
              return `<li>📂 <a href="${link}">${fileName}/</a></li>`;
            } else {
              // FIXED: Added &amp; for entities and ensured valid nesting
              const downloadLink = `${link}${inheritedQueryString ? '&amp;' : '?'}download=file`;
              return `<li>📄 ${fileName} [<a href="${link}">View</a>] [<a href="${downloadLink}" download="download">Download</a>]</li>`;
            }
          })
          .join('');
        
        const goBack = urlPath !== '/' ? `<a href="..${inheritedQueryString}">Go Back</a>` : '';
        const downloadAllBtn = `<a href="?download=zip" style="display:inline-block; margin-top:10px; padding:5px 10px; background:#007bff; color:#fff; text-decoration:none; border-radius:3px;">Download All (.zip)</a>`;
        
        listingContent = `<div><h2>Index of ${urlPath}</h2><ul>${items}</ul>${goBack}<br />${downloadAllBtn}</div>`;
      }
  
      // Return as application/xhtml+xml
      c.header('Content-Type', 'application/xhtml+xml');
      return c.html(`<?xml version="1.0" encoding="UTF-8"?>
  <!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Strict//EN" "http://www.w3.org">
  <html xmlns="http://www.w3.org/1999/xhtml" xml:lang="en" lang="en">
    <head>
      <title>Index of ${urlPath}</title>
    </head>
    <body>
      ${indexContent}
      ${indexContent.trim() && listingContent.trim() ? "<hr />" : ""}
      ${listingContent}
    </body>
  </html>`);
    }
  
  

  return c.text("Not Found", 404);
});
export default app2;

