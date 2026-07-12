const fs = require('fs');
const ts = require('typescript');

function readTranslations(filePath) {
    const code = fs.readFileSync(filePath, 'utf8');
    // Basic regex or evaluate by transpiling
    const js = ts.transpile(code);
    let dict = {};
    try {
        const mod = { exports: {} };
        const fn = new Function('module', 'exports', js);
        fn(mod, mod.exports);
        dict = mod.exports.default || mod.exports;
    } catch (e) {
        console.error("Error evaluating", filePath, e);
    }
    return dict;
}

function flattenObj(obj, prefix = '', res = {}) {
    for (let k in obj) {
        if (typeof obj[k] === 'object' && obj[k] !== null) {
            flattenObj(obj[k], prefix + k + '.', res);
        } else {
            res[prefix + k] = obj[k];
        }
    }
    return res;
}

const pt = flattenObj(readTranslations('./frontend/lib/i18n/locales/pt.ts'));
const en = flattenObj(readTranslations('./frontend/lib/i18n/locales/en.ts'));
const es = flattenObj(readTranslations('./frontend/lib/i18n/locales/es.ts'));

let issues = [];

// Find missing keys or untranslated values (where en/es equals pt)
for (let key in pt) {
    if (!en[key]) issues.push({ lang: 'EN', type: 'MISSING', key, ptValue: pt[key] });
    else if (en[key] === pt[key] && pt[key].length > 4 && !pt[key].includes("SaaS") && !pt[key].includes("ClipSaaS")) {
        issues.push({ lang: 'EN', type: 'UNTRANSLATED', key, ptValue: pt[key], val: en[key] });
    }
    
    if (!es[key]) issues.push({ lang: 'ES', type: 'MISSING', key, ptValue: pt[key] });
    else if (es[key] === pt[key] && pt[key].length > 4 && !pt[key].includes("SaaS") && !pt[key].includes("ClipSaaS")) {
        issues.push({ lang: 'ES', type: 'UNTRANSLATED', key, ptValue: pt[key], val: es[key] });
    }
}

console.log(`Found ${issues.length} translation issues.`);
if (issues.length > 0) {
    issues.slice(0, 50).forEach(i => {
        console.log(`[${i.lang}] ${i.type}: ${i.key}`);
        console.log(`   PT: ${i.ptValue}`);
        if (i.type === 'UNTRANSLATED') console.log(`   Val: ${i.val}`);
    });
}
