// Read-only compilation of the reviewed Mermaid scripts. Story routing is explicit
// here; no prose, choices, or missing branch content is invented by the compiler.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'js-yaml';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHECK = process.argv.includes('--check');
const review = path.join(ROOT, 'docs/剧本审稿');
const manifest = JSON.parse(fs.readFileSync(path.join(review, '六七幕接入源校验.json'), 'utf8'));
const { createHash } = await import('node:crypto');
for (const source of manifest.files) {
  const data = fs.readFileSync(path.join(ROOT, source.file), 'utf8').replace(/\r\n/g, '\n');
  if (createHash('sha256').update(data).digest('hex') !== source.sha256LF) {
    throw new Error(`审稿源已变化，先核对用户认可版本再更新校验记录：${source.file}`);
  }
}

function parse(chapter, side) {
  const text = fs.readFileSync(path.join(review, `第${chapter === 6 ? '六' : '七'}幕-全文-${side}.mmd`), 'utf8');
  const nodes = new Map([...text.matchAll(/^([A-Z][A-Z0-9]*)\["(.*)"\]$/gm)].map(m => [m[1], m[2]]));
  const edges = new Map();
  for (const m of text.matchAll(/^([A-Z][A-Z0-9]*) -->.*? ([A-Z][A-Z0-9]*)$/gm)) {
    if (!nodes.has(m[1]) || !nodes.has(m[2])) throw new Error('Mermaid dangling edge');
    edges.set(m[1], [...(edges.get(m[1]) ?? []), m[2]]);
  }
  const role = side === '男窗' ? '男生' : '女生';
  const channel = side === '男窗' ? 'left' : 'right';
  const prefix = `${chapter}${side === '男窗' ? 'm' : 'f'}.`;
  function field(id, key) {
    return nodes.get(id)?.match(new RegExp(`${key}：([\\s\\S]*?)(?=<br/>(?:①|②|③|④|审稿备注|记忆候选)|$)`))?.[1];
  }
  const clean = value => value.replaceAll('◆', '').replaceAll('<br/>', '\n');
  const dialog = id => field(id, `①${role}`) !== undefined;
  const groups = new Map(), variantGroup = new Map(), auto = new Set();
  for (const [id] of nodes) {
    const next = edges.get(id) ?? [];
    if (dialog(id) || next.length < 2) continue;
    if (next.every(dialog) && next.every(n => field(n, `①${role}`) === field(next[0], `①${role}`) && field(n, '②AI思考') === field(next[0], '②AI思考'))) {
      groups.set(id, next);
      for (const n of next) variantGroup.set(n, id);
    } else auto.add(id);
  }
  const times = new Map();
  let day = chapter === 6 ? 1 : 17;
  for (const [id, label] of nodes) {
    const title = label.split('<br/>')[0];
    if (/第18天|周六/.test(title)) day = 18;
    else if (/第19天|周日/.test(title)) day = 19;
    const m = title.match(/(\d{1,2}):(\d{2})/);
    if (m) times.set(id, day * 1440 + Number(m[1]) * 60 + Number(m[2]));
  }
  const lastTime = Math.max(...times.values());
  const end = chapter === 6 ? 'END' : 'OVER';
  function resolve(id) {
    if (!id) return undefined;
    if (variantGroup.has(id)) return prefix + variantGroup.get(id);
    if (dialog(id) || groups.has(id) || auto.has(id) || id === end) return prefix + id;
    const next = edges.get(id) ?? [];
    if (next.length !== 1) throw new Error(`Unknown navigation ${prefix}${id}`);
    return resolve(next[0]);
  }
  const beats = [], mapping = {};
  for (const [id] of nodes) {
    if (variantGroup.has(id)) continue;
    if (!(dialog(id) || groups.has(id) || auto.has(id) || id === end)) continue;
    const versions = groups.get(id) ?? (dialog(id) ? [id] : []);
    const timestamp = times.get(versions[0] ?? id) ?? lastTime + 1;
    const d = Math.floor(timestamp / 1440), minutes = timestamp % 1440;
    const time = `交往第${d}天 ${chapter === 6 ? '周三' : d === 17 ? '周五' : d === 18 ? '周六' : '周日'} ${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
    const beat = { id: prefix + id, channel, time, lines: [] };
    if (versions.length) {
      const first = versions[0];
      beat.lines = [{ from: channel === 'left' ? 'boy' : 'girl', text: clean(field(first, `①${role}`)), delivery: 'type' }, { from: 'ai', text: clean(field(first, '②AI思考')), delivery: 'thought' }];
      beat.choices = versions.map(version => {
        const raw = field(version, '③想法'), need = raw.match(/（需记忆：([^）]+)）/);
        const next = edges.get(version) ?? [];
        if (next.length > 1) throw new Error(`Dialogue branches without options ${version}`);
        const choice = { thought: raw.replace(/（需记忆：[^）]+）/, ''), reply: clean(field(version, '④AI回复')) };
        if (need) choice['需记忆'] = need[1];
        if (next[0]) choice.next = resolve(next[0]);
        mapping[version] = { beat: beat.id, choice: versions.indexOf(version) };
        return choice;
      });
      const short = [...field(first, `①${role}`).matchAll(/◆([^◆]+)◆/g)].map(m => m[1]);
      const declarations = field(first, '记忆候选');
      if (short.length) {
        const entries = declarations?.split('；') ?? [];
        if (entries.length !== short.length) throw new Error(`Candidate mismatch ${prefix}${first}`);
        beat['记忆候选'] = entries.map((entry, i) => {
          const [label, type, line] = entry.split('｜');
          return { 缩略标签: label, 短句: short[i], 类型: type, 线: line ?? '日常' };
        });
      } else if (declarations) throw new Error(`Missing marked quotation ${first}`);
    } else {
      beat.control = true;
      if (!auto.has(id)) beat.next = resolve((edges.get(id) ?? [])[0]);
    }
    beats.push(beat);
  }
  return { beats, mapping, auto, prefix, resolve, groups, end: prefix + end, entry: resolve('START') };
}

function compile(chapter) {
  const m = parse(chapter, '男窗'), f = parse(chapter, '女窗');
  const beats = [...m.beats, ...f.beats], byId = new Map(beats.map(b => [b.id, b]));
  const get = id => { const b = byId.get(id); if (!b) throw new Error(`Unknown overlay beat ${id}`); return b; };
  const require = (id, ...deps) => { get(id).requires = [...(get(id).requires ?? []), ...deps]; };
  const set = (id, index, flags) => { get(id).choices[index].set = flags; };
  const when = (id, flags) => { get(id).when = flags; };
  if (chapter === 6) {
    if (m.auto.size || f.auto.size) throw new Error('Unexpected CH6 automatic router');
    require(m.entry, '5m.4.4', '5f.4.4');
    require(f.entry, '6m.CHOICE');
    require('6m.M4', '6f.F4');
    require('6f.F5', '6m.M3');
    require('6f.F6', '6m.M5');
    require('6m.MEMCHOICE', '6f.F7');
    set('6m.CHOICE', 0, { '6_官宣': '直接' }); set('6m.CHOICE', 1, { '6_官宣': '含蓄' });
    set('6f.CHOICE', 0, { '6_女方公开': true }); set('6f.CHOICE', 1, { '6_女方公开': false });
    set('6m.M7A', 0, { '6_已订照片': true }); set('6m.M7B', 0, { '6_已订照片': false });
  } else {
    if ([...m.auto].join() !== 'SUN' || [...f.auto].join() !== 'REPLYOPEN,REPLYEASY') throw new Error('Unexpected CH7 automatic router');
    require(m.entry, '6m.END', '6f.END'); require(f.entry, '6m.END', '6f.END');
    // At these routers, only already-sent partner messages select the variant.
    // Memory use never routes automatically.
    when('7m.SUN', { '7_邀约已发': true });
    set('7f.FCHOICE', 0, { '7_她承认': true }); set('7f.FCHOICE', 1, { '7_她承认': false });
    for (const id of ['FSENTOPEN', 'FSENTEASY']) set('7f.' + id, 0, { '7_邀约已发': true });
    for (const [id, open] of [['OPENCHOICE', true], ['PLAINCHOICE', false]]) {
      when('7m.' + id, { '7_她承认': open }); require('7m.' + id, '7m.SUN');
      set('7m.' + id, 0, { '7_他说难受': true }); set('7m.' + id, 1, { '7_他说难受': false });
    }
    require('7f.REPLYOPEN', '7m.OPENCHOICE'); require('7f.REPLYEASY', '7m.PLAINCHOICE');
    for (const [suffix, open, hurt] of [['BOTH', true, true], ['HER', true, false], ['HIM', false, true], ['QUIET', false, false]]) {
      const flags = { '7_她承认': open, '7_他说难受': hurt };
      when('7f.RECEIVED' + suffix, flags);
      require('7f.RECEIVED' + suffix, '7f.' + (open ? 'REPLYOPEN' : 'REPLYEASY'));
      require('7m.SENT' + suffix, '7f.' + (hurt ? 'ACK' : 'RECEIVED') + suffix);
      require('7f.SET' + suffix, '7m.SENT' + suffix);
      require('7m.MEM' + suffix, '7f.SET' + suffix);
    }
    get(m.end).ending = '第七幕完成'; get(f.end).ending = '第七幕完成';
  }
  // Stable order is derived from story date/time, with explicit waits for causality.
  // Numeric day ordering avoids lexical 1/17 and locale-dependent clock order.
  const key = b => { const x = b.time.match(/第(\d+)天 .* (\d+):(\d+)/); return Number(x[1]) * 1440 + Number(x[2]) * 60 + Number(x[3]); };
  beats.sort((a, b) => key(a) - key(b)
    || Number(Boolean(b.control)) - Number(Boolean(a.control))
    || a.id.localeCompare(b.id));
  beats.forEach((beat, i) => { beat.order = i; });
  const output = {
    title: chapter === 6 ? '第六幕 · 官宣与期待' : '第七幕 · 第一次摩擦', chapter,
    时间轴: [...new Set(beats.map(b => b.time))], 默认节拍: '正常',
    speakers: [{ id: 'boy', name: '男生', channel: 'left' }, { id: 'girl', name: '女生', channel: 'right' }, { id: 'ai', name: 'AI' }],
    endings: chapter === 7 ? [{ id: '第七幕完成', title: '第七幕完成', requires: [m.end, f.end] }] : [], beats,
  };
  const filename = `content/chapter-0${chapter}.yaml`;
  const generated = `# Generated from reviewed Mermaid by node tools/build-later-chapters.mjs. Do not hand-edit.\n` + YAML.dump(output, { lineWidth: -1, noRefs: true, sortKeys: false });
  if (CHECK) {
    if (fs.readFileSync(path.join(ROOT, filename), 'utf8').replaceAll('\r\n', '\n').trimEnd() !== generated.trimEnd()) throw new Error(`${filename} 已漂移`);
  } else fs.writeFileSync(path.join(ROOT, filename), generated);
  return { chapter, beats: beats.length, sourceVersions: Object.keys(m.mapping).length + Object.keys(f.mapping).length };
}
console.log(JSON.stringify([compile(6), compile(7)]));
