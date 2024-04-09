#!/usr/bin/env node

import { diagramToSVG } from 'aasvg/markdeep-diagram.js';
import markdownit from 'markdown-it';
import hljs from 'highlight.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import YAML from 'yaml';
import url from 'node:url';

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
    await (options.pre || (async () => {}))(dirs);
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
    await (options.post || (async () => {}))();
}


async function renderToc(root, dir, selected, toc) {
    const formatEntry = (dirs, entry, isSelected) => {
        const ref = root + dirs.map(part => `${part}/`).join('') + `${entry}.html`;
        return `<div ${selected == entry ? `class="toc-selected"` : ``}>
            <a href="${ref}">
                ${entry}
            </a>
        </div>`;
    };

    const formatHeader = (dir) => {
        if (!dir) {
            return '';
        }

        // Make this collapsable
        return `<div class="toc-section">
            ${dir}
        </div>`;
    }

    let rendered = '';
    await traverseToc(toc, {
        pre: async (dirs) => rendered += formatHeader(dirs.at(-1)) + `<div class="toc-div">`,
        post: async () => rendered += '</div>',
        leaf: async (dirs, entry) => rendered += formatEntry(dirs, entry, selected == entry),
    });
    return `
        <div class="toc-header">
            <div class="toc-header-name">
                sunwalker-box
            </div>
        </div>
        <div class="toc-content">
            ${rendered}
        </div>
    `;
}

async function convert(dirs, entry, toc) {
    const input_filename = path.join('Source', ...dirs, entry + '.md');
    console.log(`Converting ${input_filename}...`);

    const output_dir = path.join('Rendered', ...dirs);
    const output_filename = path.join(output_dir, entry + '.html');

    // TODO Add header and styles?
    const root = '../'.repeat(dirs.length);
    const rendered_toc = await renderToc(root, dirs, entry, toc);

    const input = await fs.readFile(input_filename, 'utf8');
    const content = md.render(input);

    const static_root = `${root}static`;
    const rendered = `<html>
        <head>
            <title>${entry}</title>
            <link rel="stylesheet" href="${static_root}/default.css">
            <link rel="stylesheet" href="${static_root}/highlight.js.css">
        </head>
        <body>
            <div class="toc">
                ${rendered_toc}
            </div>
            <div class="content-box">
                <div class="content">
                    ${content}
                </div>
            </div>
        </body>
    </html>`;

    await fs.writeFile(output_filename, rendered);
}

async function makeStatic() {
    const dir = path.join('Rendered', 'static');
    await fs.mkdir(dir, { recursive: true });

    const resolve = where => url.fileURLToPath(import.meta.resolve(where));

    await fs.copyFile(resolve("highlight.js/styles/default.css"), path.join(dir, 'highlight.js.css'));
    await fs.copyFile(resolve("./styles/default.css"), path.join(dir, 'default.css'));
}

const toc = await getToc();
await traverseToc(toc, {
    pre: (dirs) => fs.mkdir(path.join('Rendered', ...dirs), { recursive: true }),
    leaf: (dirs, entry) => convert(dirs, entry, toc)
});
await makeStatic();

