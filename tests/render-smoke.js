/** Node-only component/state smoke test; does not require Next runtime or a browser. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const league = require('../.league-test-build/league.js');
const { T } = require('../.league-test-build/ui-text.js');

const source = fs.readFileSync(path.join(__dirname, '../app/page.tsx'), 'utf8');
const compiled = ts.transpileModule(source, {
  fileName: 'app/page.tsx', reportDiagnostics: true,
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
});
const errors = (compiled.diagnostics || []).filter(d => d.category === ts.DiagnosticCategory.Error);
assert.equal(errors.length, 0, 'Page TSX syntax compiles');

function harness() {
  let hookIndex = 0;
  const state = [];
  const runtime = { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) };
  const react = {
    useEffect: () => {},
    useMemo: (fn) => fn(),
    useState: (defaultValue) => {
      const id = hookIndex++;
      if (!(id in state)) state[id] = typeof defaultValue === 'function' ? defaultValue() : defaultValue;
      const update = (value) => { state[id] = typeof value === 'function' ? value(state[id]) : value; };
      return [state[id], update];
    },
  };
  const icons = new Proxy({}, { get: () => () => runtime.jsx('svg', {}) });
  const context = {
    exports: {},
    window: { scrollTo() {} },
    localStorage: { removeItem() {} },
    require: (name) => {
      if (name === 'react/jsx-runtime') return runtime;
      if (name === 'react') return react;
      if (name === 'lucide-react') return icons;
      if (name === '@/lib/league') return league;
      if (name === '@/lib/ui-text') return { T };
      throw new Error(`Unknown dependency ${name}`);
    },
  };
  vm.runInNewContext(compiled.outputText, context, { filename: 'app/page.js' });
  function render(tab) {
    if (tab) state[2] = tab;
    hookIndex = 0;
    const root = context.exports.default();
    const elements = [];
    const walk = (node) => {
      if (Array.isArray(node)) return node.forEach(walk);
      if (!node || typeof node !== 'object') return;
      if (typeof node.type === 'function') { walk(node.type(node.props)); return; }
      elements.push(node);
      walk(node.props?.children);
    };
    walk(root);
    return elements;
  }
  return { render, state, setHook: (index,value) => { state[index] = value; } };
}

const app = harness();
let elements = app.render();
const matches = () => elements.filter(n => n.type === 'article' && /^match-/.test(n.props?.id || ''));
const scoreInputs = () => elements.filter(n => n.type === 'input' && n.props?.className === 'score-field mt-2');
const checkbox = (match) => elements.find(n => n.type === 'input' && n.props?.['aria-label'] === `${T.games} ${match} ${T.done}`);
const teamInput = (team) => elements.find(n => n.type === 'input' && n.props?.['aria-label'] === `${T.team} ${team}`);

assert.equal(app.state[2], 'matches', 'The first tab is Match');
assert.equal(matches().length, 50, '50 mobile-friendly match cards');
assert.equal(scoreInputs().length, 100, 'Two score fields per fixture');
assert.equal(elements.filter(n => n.type === 'input' && n.props?.type === 'checkbox').length, 50);
assert.ok(elements.some(n => n.type === 'nav' && n.props?.className.includes('bottom-tabs')), 'Mobile navigation');
assert.equal(source.includes('hero-pattern'), false, 'No large introductory hero');

scoreInputs()[0].props.onChange({ target: { value: '2' } });
scoreInputs()[1].props.onChange({ target: { value: '1' } });
elements = app.render();
checkbox(1).props.onChange({ target: { checked: true } });
assert.equal(app.state[0].results[1].homeScore, '2');
assert.equal(app.state[0].results[1].awayScore, '1');
assert.equal(app.state[0].results[1].completed, true);
assert.equal(league.calculateStandings(5, league.createFixtures(5,5), app.state[0].results)[0].points,3);

elements = app.render('table');
const tables = elements.filter(n => n.type === 'table');
assert.equal(tables.length, 1, 'Desktop standings table exists');
assert.equal(elements.filter(n => n.type === 'tr').length, 6);
assert.equal(elements.filter(n => n.type === 'article').length, 5, 'Five mobile standings cards');

// A completed checkbox without a valid score is not counted.
elements = app.render('matches');
checkbox(2).props.onChange({ target: { checked: true } });
assert.equal(league.completedScoreCount(league.createFixtures(5,5), app.state[0].results),1);

// Rename the first team using settings; match cards should use the new value.
app.setHook(5, true);
elements = app.render();
assert.ok(teamInput(1));
teamInput(1).props.onChange({ target: { value: 'Alpha' } });
elements = app.render();
const form = elements.find(n => n.type === 'form');
form.props.onSubmit({ preventDefault() {} });
assert.equal(app.state[0].names[0], 'Alpha');
elements = app.render();
assert.ok(elements.some(n => n.type === 'span' && n.props?.children === 'Alpha'));

// Reset clears names, scores, checkboxes and restores the entire schedule.
app.setHook(6,true);
elements = app.render();
const reset = elements.find(n => n.type === 'button' && n.props?.children === T.resetAll);
assert.ok(reset, 'Reset button is visible after confirmation opens');
reset.props.onClick();
elements = app.render('matches');
assert.equal(matches().length,50);
assert.equal(app.state[0].names[0],'');
assert.equal(Object.keys(app.state[0].results).length,0);
assert.ok(scoreInputs().every(n => n.props.value === ''));

console.log('PASS: Mobile UI, 50 match cards, 100 score inputs, scoring, completed check, team renaming, reset');
