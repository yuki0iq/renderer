#!/usr/bin/env node

import { diagramToSVG } from 'aasvg/markdeep-diagram.js';
import markdownit from 'markdown-it';
import hljs from 'highlight.js';
import fs from 'node:fs/promises';
import path from 'node:path';
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

async function traverseToc(toc, options, dirs = []) {
    (options.pre || (() => {}))();
    for (const entry of toc) {
        if (typeof (entry) === 'string') {
            await options.leaf(dirs, entry);
        } else {
            const traverser = async ([dir, inner_toc]) => {
                await traverseToc(inner_toc, options, [...dirs, dir]);
            };

            await Promise.all(
                Object.entries(entry).map(traverser)
            );
        }
    }
    (options.post || (() => {}))();
}


async function renderToc(dir, selected, toc) {
    const formatEntry = (dirs, entry, isSelected) => {
        const ref = '../'.repeat(dir.length) + dirs.map(part => `${part}/`).join('') + `${entry}.html`;
        return `<li ${selected == entry ? `class="toc-selected"` : ``}>
            <a href="${ref}">
                ${entry}
            </a>
        </li>`;
    };

    let rendered = '';
    await traverseToc(toc, {
        pre: () => rendered += '<ul>',
        post: () => rendered += '</ul>',
        leaf: async (dirs, entry) => rendered += formatEntry(dirs, entry, selected == entry),
    });
    return rendered;
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
        <style>
            .toc-selected {
                font-weight: 900;
            }
        </style>
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
await traverseToc(toc, { leaf: (dirs, entry) => convert(dirs, entry, toc) });

