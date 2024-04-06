#!/usr/bin/env node

const { diagramToSVG } = require('aasvg/markdeep-diagram');
const markdownit = require('markdown-it');
const hljs = require('highlight.js');

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


// Stolen from https://stackoverflow.com/a/54565854
async function read(stream) {
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk); 
    return Buffer.concat(chunks).toString('utf8');
}


(async () => {
    const input = await read(process.stdin);
    const output = md.render(input);
    console.log('<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/default.min.css">');
    console.log(output);
})();
