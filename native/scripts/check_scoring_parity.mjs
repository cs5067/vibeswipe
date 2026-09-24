#!/usr/bin/env node
// Offline differential check against exact original TypeScript modules.
// Node >= 24 provides built-in type stripping; no npm packages are required.
import { stripTypeScriptTypes } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const reference = join(root, 'tests', 'reference');
const provenance = JSON.parse(readFileSync(join(reference, 'provenance.json'), 'utf8'));
const source = {};
for (const [name, entry] of Object.entries(provenance.files)) {
  const raw = readFileSync(join(reference, name));
  assert.equal(createHash('sha256').update(raw).digest('hex'), entry.sha256, `Reference snapshot changed: ${name}`);
  source[name] = raw.toString('utf8');
}
const asURL = text => `data:text/javascript;base64,${Buffer.from(text).toString('base64')}`;
const strip = name => stripTypeScriptTypes(source[name], { mode: 'strip' });
const graphURL = asURL(strip('genre-graph.ts'));
const vibeURL = asURL(strip('vibe-interpreter.ts'));
const scoringURL = asURL(strip('scoring.ts')
  .replace('"./genre-graph"', JSON.stringify(graphURL))
  .replace('"./vibe-interpreter"', JSON.stringify(vibeURL)));
const graph = await import(graphURL);
const vibes = await import(vibeURL);
const scoring = await import(scoringURL);

// Fixed seed and synthetic IDs: test runs never access a provider or real user data.
let seed = 0x5067;
const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
const pick = values => values[Math.floor(random() * values.length)];
const dims = ['energy', 'mood', 'tempo', 'intimacy', 'experimental'];
const fields = ['vibeFit', 'genreProximity', 'sequenceFit', 'artistDiversity', 'branchHealth', 'novelty', 'popularityFit', 'total'];
const genreKeys = [...source['genre-graph.ts'].split('};', 1)[0].matchAll(/^\s*(?:"([^"]+)"|([a-z-]+)):\s*\[/gm)].map(m => m[1] || m[2]);
const allGenres = [...new Set([...genreKeys, ...genreKeys.flatMap(g => graph.getRelatedGenres(g)), ...Object.keys(vibes.GENRE_VIBES), 'unknown', 'POP'])];
const sampleGenres = ['pop', 'rock', 'classical', 'piano', 'hip hop', 'rap', 'lo-fi', 'ambient', 'unknown', 'POP', 'metal', 'neo soul', 'dancehall', 'jazz'];
const genreList = () => Array.from({ length: Math.floor(random() * 4) }, () => pick(sampleGenres));
const track = id => ({ id, genres: genreList(), artistIds: random() < 0.1 ? [] : [pick(['a', 'b', 'c', 'd']), ...(random() < 0.2 ? ['featured'] : [])], popularity: Math.floor(random() * 101), branchId: pick(['', 'fresh', 'positive', 'negative', 'mature', 'missing']) });
const blankProfile = () => ({ genreWeights: new Map(), knownArtistIds: new Set(), genreTransitions: new Map(), popularityRange: [0, 100], sessionVibe: { energy: .5, mood: .5, tempo: .5, intimacy: .5, experimental: .3 }, lastLikedTracks: [] });
const scenarios = [];
for (let i = 0; i < 100; i++) {
  const p = blankProfile();
  p.genreWeights = new Map(sampleGenres.map(g => [g.toLowerCase(), random() * 1.5 - .1]));
  p.knownArtistIds = new Set(i % 2 ? ['a', 'featured'] : []);
  p.genreTransitions = new Map(sampleGenres.slice(0, 5).map(g => [g, new Map(sampleGenres.slice(0, 5).map(next => [next, Math.floor(random() * 12)]))]));
  p.sessionVibe = Object.fromEntries(dims.map(d => [d, random()]));
  const low = Math.floor(random() * 60), high = i % 5 === 0 ? low : low + Math.floor(random() * (101 - low));
  p.popularityRange = [low, high];
  p.lastLikedTracks = i % 4 ? [{ genres: genreList(), energy: random() }] : [];
  const liked = Array.from({ length: i % 18 }, (_, j) => track(`liked-${j}`));
  const candidates = Array.from({ length: 10 }, (_, j) => track(`candidate-${j}`));
  // Every scenario has an exact duplicate score to check stable sorting.
  candidates.push({ ...candidates[0], id: 'tied-copy' });
  const branches = new Map([['fresh', { likes: 0, dislikes: 0 }], ['positive', { likes: 1, dislikes: 0 }], ['negative', { likes: 0, dislikes: 1 }], ['mature', { likes: 7, dislikes: 3 }]]);
  scenarios.push({ profile: p, liked, candidates, branches });
}
scenarios.push({ profile: blankProfile(), liked: [], candidates: [{ id: 'no-data', genres: [], artistIds: [], popularity: 0, branchId: '' }], branches: new Map() });
scenarios.push({ profile: blankProfile(), liked: [], candidates: [], branches: new Map() });

// Generate typed C++ fixtures so the library needs no JSON dependency. The
// generated file is build output, never an alternative scoring implementation.
const q = JSON.stringify;
const list = xs => `{${xs.map(q).join(',')}}`;
const ct = t => `{${q(t.id)},${list(t.genres)},${list(t.artistIds)},${t.popularity},${q(t.branchId || '')}}`;
const cpp = [
  '#include "vibeswipe/scoring.hpp"', '#include <iostream>', '#include <iomanip>',
  'using namespace vibeswipe;', 'int main(){std::cout << std::setprecision(17);',
  `std::vector<std::string> genres = ${list(allGenres)};`,
  'for(const auto& a:genres)for(const auto& b:genres)std::cout << "G " << genre_similarity(a,b) << "\\n";',
  'for(const auto& g:genres){auto v=get_genre_vibe(g);std::cout << "V " << v.energy << " " << v.mood << " " << v.tempo << " " << v.intimacy << " " << v.experimental << "\\n";}',
];
for (let i = 0; i < scenarios.length; i++) {
  const { profile: p, liked, candidates, branches } = scenarios[i];
  cpp.push('{TasteProfile p;');
  cpp.push(`p.genre_weights={${[...p.genreWeights].map(([k, v]) => `{${q(k)},${v}}`).join(',')}};`);
  cpp.push(`p.known_artist_ids=${list([...p.knownArtistIds])};`);
  cpp.push(`p.popularity_range={${p.popularityRange.join(',')}};`);
  cpp.push(`p.session_vibe={${dims.map(d => p.sessionVibe[d]).join(',')}};`);
  cpp.push(`p.last_liked_tracks={${p.lastLikedTracks.map(t => `{${list(t.genres)},${t.energy}}`).join(',')}};`);
  for (const [from, transitions] of p.genreTransitions) for (const [to, count] of transitions) cpp.push(`p.genre_transitions[${q(from)}][${q(to)}]=${count};`);
  cpp.push(`std::vector<Track> liked={${liked.map(ct).join(',')}};`);
  cpp.push(`std::vector<Track> candidates={${candidates.map(ct).join(',')}};`);
  cpp.push(`std::unordered_map<std::string,Branch> branches={${[...branches].map(([id, b]) => `{${q(id)},{${b.likes},${b.dislikes}}}`).join(',')}};`);
  cpp.push('for(const auto& t:candidates){auto it=branches.find(t.branch_id);auto s=score_track(t,p,it==branches.end()?nullptr:&it->second,liked);');
  cpp.push(`std::cout << "S ${i} " << t.id << " " << s.vibe_fit << " " << s.genre_proximity << " " << s.sequence_fit << " " << s.artist_diversity << " " << s.branch_health << " " << s.novelty << " " << s.popularity_fit << " " << s.total << "\\n";}`);
  cpp.push(`std::cout << "R ${i}";for(const auto& r:rank_candidates(candidates,p,branches,liked))std::cout << " " << r.track.id;std::cout << "\\n";}`);
}
cpp.push('}');
const build = join(root, 'build', 'scoring-parity');
mkdirSync(build, { recursive: true });
const fixtureFile = join(build, 'fixture.cpp');
writeFileSync(fixtureFile, cpp.join('\n'));
const binary = join(build, 'fixture');
const compiler = process.env.CXX || 'c++';
const compilation = spawnSync(compiler, ['-std=c++17', '-O0', '-Wall', '-Wextra', '-Wpedantic', '-I', join(root, 'include'), join(root, 'src', 'scoring.cpp'), fixtureFile, '-o', binary], { encoding: 'utf8' });
if (compilation.error) throw compilation.error;
assert.equal(compilation.status, 0, compilation.stderr);
const result = spawnSync(binary, [], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
if (result.error) throw result.error;
assert.equal(result.status, 0, result.stderr);
const lines = result.stdout.trim().split('\n');
let line = 0, comparisons = 0, maxError = 0;
const compare = (actual, expected, context) => {
  const error = Math.abs(actual - expected);
  assert(Number.isFinite(actual) && error <= 1e-12, `${context}: C++ ${actual}, TypeScript ${expected}`);
  maxError = Math.max(maxError, error); comparisons++;
};
for (const from of allGenres) for (const to of allGenres) {
  const [kind, value] = lines[line++].split(' '); assert.equal(kind, 'G');
  compare(Number(value), graph.genreSimilarity(from, to), `genre ${from} -> ${to}`);
}
for (const genre of allGenres) {
  const [kind, ...values] = lines[line++].split(' '); assert.equal(kind, 'V');
  const expected = vibes.getGenreVibe(genre);
  dims.forEach((d, i) => compare(Number(values[i]), expected[d], `genre vibe ${genre}.${d}`));
}
let tracks = 0;
for (let i = 0; i < scenarios.length; i++) {
  const { profile, liked, candidates, branches } = scenarios[i];
  for (const candidate of candidates) {
    const [kind, index, id, ...values] = lines[line++].split(' ');
    assert.equal(kind, 'S'); assert.equal(Number(index), i); assert.equal(id, candidate.id);
    const expected = scoring.scoreTrack(candidate, profile, branches.get(candidate.branchId) || null, liked);
    fields.forEach((field, j) => compare(Number(values[j]), expected[field], `scenario ${i}, ${id}.${field}`));
    tracks++;
  }
  const [kind, index, ...ids] = lines[line++].split(' ');
  assert.equal(kind, 'R'); assert.equal(Number(index), i);
  assert.deepEqual(ids, scoring.rankCandidates(candidates, profile, branches, liked).map(r => r.track.id), `rank order in scenario ${i}`);
}
assert.equal(line, lines.length, 'Unexpected extra C++ output');
console.log(`scoring parity: ${tracks} tracks, ${scenarios.length} stable rank orders, ${allGenres.length ** 2} directed genre pairs, ${comparisons} numeric comparisons passed (max absolute error ${maxError})`);
