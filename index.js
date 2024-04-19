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
            // Dark theme is done with CSS filter
            const diagram = diagramToSVG(str, {
                // Hack to make text consume fixed space
                stretch: true,
                // Hack to use default font size from browser
                style: { 'font-size': ' ' }
            });
            // Somewhat incorrect assume: if you can't show SVGs you probably can't parse basic CSS
            return `<pre style="display: none;">${str}</pre>${diagram}`;
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
    await (options.post || (async () => {}))(dirs);
}

function formatPath(dirs, entry) {
    return dirs.map(part => `${part}/`).join('') + `${entry}.html`;
}

async function renderToc(root, current_dirs, selected, toc) {
    const formatEntry = (dirs, entry) => {
        const ref = root + formatPath(dirs, entry);
        const isSelected = entry === selected
            && current_dirs.length === dirs.length
            && current_dirs.every((x, i) => x === dirs[i]);
        return `<li class="toc-entry ${isSelected ? `toc-selected` : ``}">
            <a href="${ref}">
                ${entry}
            </a>
        </li>`;
    };

    const formatHeader = (dirs) => {
        const dir = dirs.at(-1);
        if (!dir) {
            return '<ul class="toc-list">';
        }

        const isSelected = dirs.length <= current_dirs.length
            && dirs.every((x, i) => x === current_dirs[i]);
        return `<details class="toc-section" ${isSelected ? `open` : ``}>
            <summary class="toc-section-header">
                ${dir}
            </summary>
            <ul class="toc-list">
        `;
    }

    let rendered = '';
    await traverseToc(toc, {
        pre: async (dirs) => rendered += formatHeader(dirs),
        post: async (dirs) => rendered += '</ul>' + (dirs ? '</details>' : ''),
        leaf: async (dirs, entry) => rendered += formatEntry(dirs, entry),
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

async function convert(toc, toc_list, counter) {
    const item = toc_list[counter];

    const rendered_toc = await renderToc(item.root, item.dirs, item.entry, toc);

    const navlink = (nav, name) => !nav ? '' : `<div class="navigation-link">
        <a href="${item.root + nav.url}">
            ${name}: ${nav.title}
        </a>
    </div>`;
    const navigation = `<div class="navigation">
        ${navlink(toc_list[counter - 1], `Previous`)}
        <div class="navigation-filler"></div>
        ${navlink(toc_list[counter + 1], `Next`)}
    </div>`;

    const rendered = `<!DOCTYPE html><html>
        <head>
            <title>${item.title}</title>
            <link rel="stylesheet" href="${item.root}static/default.css">
        </head>
        <body>
            <div class="toc">
                ${rendered_toc}
            </div>
            <div class="content-box">
                <div class="content">
                    <header>
                        <h1>${item.title}</h1>
                        ${navigation}
                        <hr>
                    </header>
                    ${item.content}
                    <footer>
                        <hr>
                        ${navigation}
                    </footer>
                </div>
            </div>
        </body>
    </html>`;

    await fs.writeFile(item.output, rendered);
}

async function makeStatic() {
    const dir = path.join('Rendered', 'static');
    await fs.mkdir(dir, { recursive: true });

    const resolve = where => url.fileURLToPath(import.meta.resolve(where));

    await fs.copyFile(resolve("highlight.js/styles/a11y-light.css"), path.join(dir, 'highlight.default.css'));
    await fs.copyFile(resolve("highlight.js/styles/a11y-dark.css"), path.join(dir, 'highlight.dark.css'));
    for (const style of ["default", "diagram", "headers", "highlight", "links", "toc"]) {
        await fs.copyFile(resolve(`./styles/${style}.css`), path.join(dir, `${style}.css`));
    }
}

async function flattenToc(toc) {
    let result = [];

    async function resultify(dirs, entry) {
        const input_filename = path.join('Source', ...dirs, entry + '.md');

        const input = await fs.readFile(input_filename, 'utf8');
        const content = md.render(input);

        const title_regex = /<h1>(.+?)<\/h1>/;
        const title = (content.match(title_regex) || []).at(1);
        const headless_content = content.replace(title_regex, '');

        return {
            dirs: dirs,
            entry: entry,
            root: '../'.repeat(dirs.length),
            output: path.join('Rendered', ...dirs, `${entry}.html`),
            url: formatPath(dirs, entry),
            title: title,
            content: headless_content,
        };
    }

    await traverseToc(toc, {
        pre: (dirs) => fs.mkdir(path.join('Rendered', ...dirs), { recursive: true }),
        leaf: async (dirs, entry) => result.push(await resultify(dirs, entry)),
    });

    return result;
}

const toc = await getToc();
const toc_list = await flattenToc(toc);

await Promise.all(
    toc_list.map(
        (item, index) => convert(toc, toc_list, index)
    )
);

await makeStatic();
