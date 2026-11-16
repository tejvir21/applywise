import { extractStructuredResume } from './src/resume/parser/structured.js';
import fs from 'node:fs';
import path from 'node:path';

const FIXTURE = fs.readFileSync(path.join('tests', 'fixtures', 'chirag-pandit-resume.txt'), 'utf8');
const parse = extractStructuredResume(FIXTURE);

console.log('=== SKILLS ===');
parse.skills.forEach(s => console.log('  ' + s.name + ' | section:' + s.section + ' | method:' + s.method + ' | conf:' + s.confidence + ' | cat:' + s.category + ' | evidence:' + s.evidence));

console.log('\n=== REVIEW CANDIDATES ===');
parse.reviewCandidates.forEach(r => console.log('  "' + r.text + '" | reason:' + r.reason + ' | section:' + r.section));

console.log('\n=== WARNINGS ===');
parse.warnings.forEach(w => console.log('  [' + w.field + '] ' + w.message));

console.log('\n=== CONTACT ===');
console.log(JSON.stringify(parse.personal, null, 2));

console.log('\n=== LINKS ===');
console.log(JSON.stringify(parse.links, null, 2));