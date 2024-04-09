#!/usr/bin/env node

import { diagramToSVG } from 'aasvg/markdeep-diagram.js';
import markdownit from 'markdown-it';
import hljs from 'highlight.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import { ReadStream } from 'node:fs';
import YAML from 'yaml';

const md = markdownit({
    typographer: true,
    highlight: function (str, lang) {
        if (lang === 'ascii') {
            // First part is a dirty hack around markdown-it.
            return '<pre></pre>' + diagramToSVG(str, { style: { 'font-size': ' ' } });
        }

        if (lang && hljs.getLanguage(lang)) {
            try {
                return hljs.highlight(str, { language: lang }).value;
            } catch (__) {}
        }

        // Use insane defaults
        return '';
    }
});

async function getToc() {
    const toc = await fs.readFile('toc', 'utf8');
    return YAML.parse(toc);
}

async function traverseToc(toc, dirs = []) {
    for (const entry of toc) {
        if (typeof (entry) === 'string') {
            await convert(dirs, entry, toc);
        } else {
            const traverser = async ([dir, inner_toc]) => {
                await traverseToc(inner_toc, [...dirs, dir]);
            };

            await Promise.all(
                Object.entries(entry).map(traverser)
            );
        }
    }
}


async function renderToc(dir, selected, toc) {
    return `
        <p>Selected ${selected} of ${dir}</p>
        <p>TOC ${toc}</p>
    `;
}

async function convert(dirs, entry, toc) {
    const input_filename = path.join('Source', ...dirs, entry + '.md');
    console.log(`Converting ${input_filename}...`);

    const output_dir = path.join('Rendered', ...dirs);
    const output_filename = path.join(output_dir, entry + '.html');

    // TODO Add header and styles?
    const rendered_toc = await renderToc(dirs, entry, toc);

    const input = await fs.readFile(input_filename, 'utf8');
    const content = md.render(input);

    const rendered = `<html>
    <head>
        <title>${entry}</title>
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/default.min.css">
    </head>
    <body>
        <div class="toc">
            ${rendered_toc}
        </div>
        <div class="content">
            ${content}
        </div>
    </body>
</html>`;

    await fs.mkdir(output_dir, { recursive: true });
    await fs.writeFile(output_filename, rendered);
}

const toc = await getToc();
await traverseToc(toc);

