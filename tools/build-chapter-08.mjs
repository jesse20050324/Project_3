import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import YAML from 'js-yaml';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const check = process.argv.includes('--check');
const directory = 'docs/剧本审稿';
const manifest = [];
const beats = [];
const byId = new Map();
const matrix = {
  M: { self: '要求看私聊', ideal: '都会回', fifth: '不会谈恋爱', seventh: '一天没回' },
  F: { self: '故意不回', ideal: '家里有爱', fifth: '半夜刷朋友圈', seventh: '查看私聊' },
};
const idFor = id => '8' + id[0].toLowerCase() + '.' + id;

function add(id, time, fields = {}) {
  const beat = { id: idFor(id), channel: id[0] === 'M' ? 'left' : 'right', time, lines: [], ...fields };
  if (byId.has(id)) throw new Error('重复节点 ' + id);
  byId.set(id, beat);
  beats.push(beat);
  return beat;
}

function compile(side, windowName, role) {
  const file = directory + '/第八幕-重写-' + windowName + '.mmd';
  const source = fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n');
  manifest.push({ file, sha256LF: createHash('sha256').update(source).digest('hex') });
  const nodes = new Map([...source.matchAll(/^(\w+)\["(.*)"\]$/gm)].map(([, id, label]) => [id, label]));
  const edges = new Map();
  for (const [, from, to] of source.matchAll(/^(\w+) -->(?:\|[^|]+\|)? (\w+)$/gm)) {
    if (!nodes.has(from) || !nodes.has(to)) throw new Error('审稿图存在悬空连线');
    edges.set(from, [...(edges.get(from) ?? []), to]);
  }

  const ready = side + 'READY';
  add(ready, '20:29', { control: true });
  for (const [id, label] of nodes) {
    if (!label.includes('<br/>①' + role + '：')) continue;
    const [title, ...fields] = label.split(/<br\/>/);
    const time = title.match(/\b\d\d:\d\d\b/)?.[0];
    if (!time) throw new Error('缺少时间 ' + id);
    const [, message, thought, ...options] = fields.join('\n').match(
      new RegExp('^①' + role + '：([\\s\\S]+?)\\n②AI思考：([\\s\\S]+?)\\n(③[\\s\\S]+)$'),
    ) ?? [];
    if (!message || !thought) throw new Error('缺少角色消息或AI思考 ' + id);
    const optionsText = options.join('').split(/\n【/)[0];
    const choices = [...optionsText.matchAll(/(?:^|\n)③想法(?: [AB])?：([^\n]+)\n④AI回复(?: [AB])?：([\s\S]*?)(?=\n③|$)/g)];
    if (choices.length !== (optionsText.match(/(?:^|\n)③想法/g) ?? []).length || !choices.length) {
      throw new Error('选项解析失败 ' + id);
    }
    const next = edges.get(id) ?? [];
    if (next.length > 1 && next.length !== choices.length && id !== 'M301R') {
      throw new Error('选项与连线数量不符 ' + id);
    }
    const beat = add(id, time, {
      lines: [
        { from: side === 'M' ? 'boy' : 'girl', text: message, delivery: 'type' },
        { from: 'ai', text: thought, delivery: 'thought' },
      ],
      choices: choices.map(([, raw, reply], index) => {
        const match = raw.match(/（需(?:第[六七]幕「([^」]+)」|本窗至少一组旧证据)）$/);
        const choice = { thought: match ? raw.slice(0, match.index) : raw, reply };
        if (match?.[1]) choice.需记忆 = match[1];
        const target = next[index];
        if (target === side + 'RECOG') {
          const { self, ideal, fifth, seventh } = matrix[side];
          const variants = [
            ['B7', [self, ideal, seventh]], ['B5', [self, ideal, fifth]],
            ['O7', [ideal, seventh]], ['O5', [ideal, fifth]], ['S', [self]],
          ];
          if (variants.some(([suffix]) => !(edges.get(target) ?? []).includes(side + '202' + suffix))) {
            throw new Error('审稿图缺少认识到变体 ' + id);
          }
          choice.记忆后继 = variants.map(([suffix, all]) => ({ all, next: idFor(side + '202' + suffix) }));
        } else if (target && id !== 'M301R') {
          choice.next = idFor([side + '204R', side + 'STAGEE', side + 'STAGER'].includes(target) ? ready : target);
        }
        if (id === side + '201') choice.set = { ['8_' + side + '_认识']: index === 1 };
        return choice;
      }),
    });
    if (id === side + '101') beat.requires = ['7m.OVER', '7f.OVER'];
  }
}

compile('M', '男窗', '男生');
compile('F', '女窗', '女生');

// The four stage-three paths depend on the two choices already made.
const outcome = {
  M301E: [false, false], F301E: [false, false],
  M301ER: [false, true], F301ER: [false, true],
  F301RE: [true, false], M302RE: [true, false],
  F301RR: [true, true], M302RR: [true, true],
};
for (const [id, [male, female]] of Object.entries(outcome)) {
  Object.assign(byId.get(id), {
    when: { '8_M_认识': male, '8_F_认识': female },
    requires: [idFor('MREADY'), idFor('FREADY')],
  });
}
function requireBefore(receive, ...senders) {
  const beat = byId.get(receive);
  beat.requires = [...(beat.requires ?? []), ...senders.map(idFor)];
}
requireBefore('M301R', 'MREADY', 'FREADY');
byId.get('M301R').when = { '8_M_认识': true };
requireBefore('M103', 'F103');
requireBefore('F104', 'M103');
requireBefore('F106', 'M106');
requireBefore('M107', 'F106');
requireBefore('F107', 'M107');
requireBefore('M301E', 'F301E');
requireBefore('M301ER', 'F301ER');
requireBefore('F301RE', 'M301R');
requireBefore('F301RR', 'M301R');
requireBefore('M302RE', 'F301RE');
requireBefore('F302RE', 'M302RE');
requireBefore('M303RE', 'F302RE');
requireBefore('M302RR', 'F301RR');
requireBefore('F302ER', 'M301ER');
requireBefore('M302ER', 'F302ER');
requireBefore('F303ER', 'M302ER');
requireBefore('M303ER', 'F303ER');
requireBefore('M304G', 'F304G');

const endings = [
  { id: '和好', title: '和好', requires: ['M305G', 'F305G'].map(idFor) },
  { id: '分手', title: '分手', requires: ['M303E', 'F302E'].map(idFor) },
];
for (const ending of endings) {
  for (const beat of beats.filter(beat => ending.requires.includes(beat.id))) beat.ending = ending.id;
}
beats.sort((a, b) => a.time.localeCompare(b.time) || a.id.localeCompare(b.id));
beats.forEach((beat, index) => { beat.order = index; });
const output = {
  title: '第八幕 · 一个月纪念日', chapter: 8,
  时间轴: [...new Set(beats.map(beat => beat.time))], 默认节拍: '正常',
  speakers: [{ id: 'boy', name: '男生', channel: 'left' }, { id: 'girl', name: '女生', channel: 'right' }, { id: 'ai', name: 'AI' }],
  endings, beats,
};

function emit(file, data) {
  const filename = path.join(root, file);
  if (!check) fs.writeFileSync(filename, data);
  else if (fs.readFileSync(filename, 'utf8').replace(/\r\n/g, '\n') !== data) throw new Error(file + ' 已漂移');
}
emit('content/chapter-08.yaml', '# Generated by tools/build-chapter-08.mjs from the reviewed Mermaid.\n' +
  YAML.dump(output, { lineWidth: -1, noRefs: true }));
emit(directory + '/第八幕接入源校验.json', JSON.stringify({ files: manifest }, null, 2) + '\n');
console.log('CH8: ' + beats.length + ' beats');
