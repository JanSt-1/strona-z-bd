// Szuka zaślepek treści ("[X]", "Placeholder") w kodzie i buildzie frontendu, żeby nie trafiły na produkcję.
// Kod wyjścia 1, gdy coś znajdzie. Atrybut HTML `placeholder` (małą literą) nie jest zaślepką i jest pomijany.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DIRS = ['frontend/src', 'frontend/dist'];
const EXTENSIONS = new Set(['.js', '.jsx', '.html', '.css', '.json']);
const PATTERN = /\[X\]|Placeholder/;

function* walk(dir) {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) yield* walk(full);
        else if (EXTENSIONS.has(path.extname(entry.name))) yield full;
    }
}

const hits = [];
for (const dir of DIRS) {
    for (const file of walk(path.join(ROOT, dir))) {
        fs.readFileSync(file, 'utf8').split(/\r?\n/).forEach((line, i) => {
            if (PATTERN.test(line)) {
                hits.push(`${path.relative(ROOT, file)}:${i + 1}: ${line.trim().slice(0, 160)}`);
            }
        });
    }
}

if (hits.length) {
    console.error(`Znaleziono zaślepki treści (${hits.length}) - uzupełnij frontend/src/tresci.js przed wdrożeniem:`);
    hits.forEach((h) => console.error(`  ${h}`));
    process.exit(1);
}
console.log('Brak zaślepek treści w frontend/src i frontend/dist.');
