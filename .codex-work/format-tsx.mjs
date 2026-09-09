import fs from 'node:fs';
import ts from 'file:///C:/Users/user/Desktop/MyVet_Workspace/node_modules/typescript/lib/typescript.js';

const [target] = process.argv.slice(2);
if (!target) throw new Error('Missing target');
const source = fs.readFileSync(target, 'utf8');
const file = ts.createSourceFile(target, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });
fs.writeFileSync(target, `${printer.printFile(file)}\n`);
