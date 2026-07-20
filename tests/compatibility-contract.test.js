const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function sha256(relativePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(path.join(root, relativePath))).digest('hex');
}

const protectedFiles = {
  'js/sync.js': '88382180da442ae16b5ff1773d8862371a2d391442f71d6a4a6d780d15a6f933',
  'js/ask-dr-holtkamp.js': '308d196da262f987572e9abae7c4649b4c8408d37587299149f9fe7a265bdef3',
  'js/app-routing.js': '838a22c12a714562db9167b07107d1a3c116332cf90906584b1456f8e66f1af3',
  'js/app-service-line.js': 'dc7a5f30424e92f30be6c2019f48ab1ed912f88f0e6e8ee05e273d65eaec7266',
  'js/app-metrics.js': '296bb9d11c09e02a5cb2c733ee8512b18fbd2d7d229808e14fab63d830df46dc',
  'js/app-service-collab.js': '1e4c925158c87da38e3f9016b6b1ca8655af7bc9e306f6995cb0ff25ecaaf79f',
  'js/app-rollup.js': '5287272e7765973c1e1eb406c6e802da9b04e3e5b1580c498f8c9706c3db65a7',
  'css/app-shell.css': '617c14931dd76433dbbd7f6cd8d0c322f193e9ab2ad1e1f5acf9be96daf58c1a',
  'css/ask-dr-holtkamp.css': '52479c53a6d20090abd8c5ad47f7d78d883dd284e4e36622d54c14daafac45a0',
  'css/emergency-department.css': '16fc2d2088d94b00a720c42053245ccef4582124434b5925c8f7450c707b469b',
  'css/framework-cinematic.css': 'b50c0008cfc5daf1d2f47e96a53cd51845638e5142645d80cd999384fc8a0367',
  'css/landing-cinematic.css': 'c9ae518b63b8d6cd3f5c8abc30cc432083187c313aebafb48f093abca754cfec',
  'css/metrics.css': 'e3c8dca33e2db4a2da25e0451e20dfc6917f3707ed9cbb96502491bd51523e26',
  'css/pages-workflow.css': '654b4cbd7adac3e8fa5af171f3b06858995a3a1dae84001dac1ef4aa21534639',
  'css/responsive.css': '57ea4e1ff7f9211d896886e223ed7a524c23851f1ddd955668d6a2f39ca5a7c5',
  'css/runtime-overlays.css': '5348b037beb8b2b5fcd9a7e37c2bdc0ef26ad2681ee75f105c13d326df6076c1',
  'css/styles.css': 'c09482d9ce7ea65541b3a8ed823fc2fe20e71c947ba5ae588d7533925f3e5967'
};

test('protected workflow and shared-style files match the pre-Outlook baseline', () => {
  for (const [relativePath, expectedHash] of Object.entries(protectedFiles)) {
    assert.equal(sha256(relativePath), expectedHash, `${relativePath} changed from the trained-workflow baseline`);
  }
});

test('top navigation labels, destinations, and handlers remain unchanged', () => {
  const index = read('index.html');
  assert.match(index, /id="btn-dashboard"[^>]*onclick="location\.hash='#\/dashboard'"[^>]*>Dashboard<\/button>/);
  assert.match(index, /id="btn-rollup"[^>]*onclick="location\.hash='#\/rollup'"[^>]*>Rollup<\/button>/);
  assert.match(index, /id="btn-ask-dr-holtkamp"[^>]*>Ask Dr\. Holtkamp<\/button>/);
});

test('service-line order, labels, routes, and metric IDs match the trained contract', () => {
  const source = `${read('js/data.js')}\n;FRAMEWORK;`;
  const framework = vm.runInNewContext(source, {});
  assert.deepEqual(
    Array.from(framework.serviceLines, line => `${line.id}|${line.name}`),
    [
      'pcsl|Primary Care Service Line',
      'surgery|Surgical Services Service Line',
      'mental-health|Mental Health Service Line',
      'emergency|Emergency Department',
      'mscoe|MSCoE Surgeon / Trainee Care Model'
    ]
  );
  const metricIds = framework.serviceLines.flatMap(line => [
    ...(line.trackedMetrics || []).map(metric => metric.id),
    ...(line.metricGroups || []).flatMap(group => group.series.map(metric => metric.id))
  ]);
  assert.deepEqual(Array.from(metricIds), [
    'pcsl-acute', 'pcsl-followup', 'pcsl-medic', 'pcsl-sickcall', 'pcsl-nursing', 'pcsl-virtual',
    'surgery-total', 'surgery-obgyn', 'surgery-general', 'surgery-ortho',
    'mh-active-duty-off-post', 'mh-nonsudcc-visits-per-patient',
    'er-total-census', 'er-total-trainees', 'er-esi-1-2', 'er-esi-3', 'er-esi-4-5', 'er-lwobs'
  ]);
});

test('Outlook is loaded as an additive module and Dashboard still routes through renderDashboard', () => {
  const index = read('index.html');
  const routing = read('js/app-routing.js');
  assert.match(index, /src="js\/app-decision-outlook\.js\?/);
  assert.match(routing, /if \(isDashboard\) this\.renderDashboard\(main\);/);
});

test('decision memory is additive and loads between the protected assistant and SITREP extension', () => {
  const index = read('index.html');
  const assistantIndex = index.indexOf('src="js/ask-dr-holtkamp.js?');
  const memoryIndex = index.indexOf('src="js/ask-dr-holtkamp-decisions.js?');
  const sitrepIndex = index.indexOf('src="js/ask-dr-holtkamp-sitrep.js?');
  assert.ok(assistantIndex >= 0);
  assert.ok(memoryIndex > assistantIndex);
  assert.ok(sitrepIndex > memoryIndex);
});
