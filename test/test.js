'use strict';

/*eslint-env node,mocha*/

var fs      = require('fs');
var path    = require('path');
var assert  = require('assert');

var linkify = require('../');

var lines;


describe('links', function () {

  var l = linkify({ fuzzyIP: true });

  l.normalize = function () {}; // kill normalizer

  lines = fs.readFileSync(path.join(__dirname, 'fixtures/links.txt'), 'utf8').split(/\r?\n/g);

  var skipNext = false;

  lines.forEach(function (line, idx) {
    if (skipNext) {
      skipNext = false;
      return;
    }

    line = line.replace(/^%.*/, '');

    var next = (lines[idx + 1] || '').replace(/^%.*/, '');

    if (!line.trim()) { return; }

    if (next.trim()) {
      it('line ' + (idx + 1), function () {
        assert.ok(l.pretest(line), '(pretest failed in `' + line + '`)');
        assert.ok(l.test('\n' + line + '\n'), '(link not found in `\\n' + line + '\\n`)');
        assert.ok(l.test(line), '(link not found in `' + line + '`)');
        assert.strictEqual(l.match(line)[0].url, next);
      });
      skipNext = true;
    } else {
      it('line ' + (idx + 1), function () {
        assert.ok(l.pretest(line), '(pretest failed in `' + line + '`)');
        assert.ok(l.test('\n' + line + '\n'), '(link not found in `\\n' + line + '\\n`)');
        assert.ok(l.test(line), '(link not found in `' + line + '`)');
        assert.strictEqual(l.match(line)[0].url, line);
      });
    }
  });

});


describe('not links', function () {

  var l = linkify();

  l.normalize = function () {}; // kill normalizer

  lines = fs.readFileSync(path.join(__dirname, 'fixtures/not_links.txt'), 'utf8').split(/\r?\n/g);

  lines.forEach(function (line, idx) {
    line = line.replace(/^%.*/, '');

    if (!line.trim()) { return; }

    it('line ' + (idx + 1), function () {
      assert.ok(!l.test(line),
        '(should not find link in `' + line + '`, but found `' +
        JSON.stringify((l.match(line) || [])[0]) + '`)');
    });
  });

});

describe('API', function () {

  it('extend tlds', function () {
    var l = linkify();

    assert.ok(!l.test('google.myroot'));

    l.tlds('myroot', true);

    assert.ok(l.test('google.myroot'));
    assert.ok(!l.test('google.xyz'));

    l.tlds(require('tlds'));

    assert.ok(l.test('google.xyz'));
    assert.ok(!l.test('google.myroot'));
  });


  it('add rule as regexp, with default normalizer', function () {
    var l = linkify().add('my:', {
      validate: /^\/\/[a-z]+/
    });

    var match = l.match('google.com. my:// my://asdf!');

    assert.strictEqual(match[0].text, 'google.com');
    assert.strictEqual(match[1].text, 'my://asdf');
  });


  it('add rule with normalizer', function () {
    var l = linkify().add('my:', {
      validate: /^\/\/[a-z]+/,
      normalize: function (m) {
        m.text = m.text.replace(/^my:\/\//, '').toUpperCase();
        m.url  = m.url.toUpperCase();
      }
    });

    var match = l.match('google.com. my:// my://asdf!');

    assert.strictEqual(match[1].text, 'ASDF');
    assert.strictEqual(match[1].url, 'MY://ASDF');
  });


  it('disable rule', function () {
    var l = linkify();

    assert.ok(l.test('http://google.com'));
    assert.ok(l.test('foo@bar.com'));
    l.add('http:', null);
    l.add('mailto:', null);
    assert.ok(!l.test('http://google.com'));
    assert.ok(!l.test('foo@bar.com'));
  });


  it('add bad definition', function () {
    var l;

    l = linkify();

    assert.throws(function () {
      l.add('test:', []);
    });

    l = linkify();

    assert.throws(function () {
      l.add('test:', { validate: [] });
    });

    l = linkify();

    assert.throws(function () {
      l.add('test:', {
        validate: function () { return false; },
        normalize: 'bad'
      });
    });
  });


  it('test at position', function () {
    var l = linkify();

    assert.ok(l.testSchemaAt('http://google.com', 'http:', 5));
    assert.ok(l.testSchemaAt('http://google.com', 'HTTP:', 5));
    assert.ok(!l.testSchemaAt('http://google.com', 'http:', 6));

    assert.ok(!l.testSchemaAt('http://google.com', 'bad_schema:', 6));
  });


  it('correct cache value', function () {
    var l = linkify();

    var match = l.match('.com. http://google.com google.com ftp://google.com');

    assert.strictEqual(match[0].text, 'http://google.com');
    assert.strictEqual(match[1].text, 'google.com');
    assert.strictEqual(match[2].text, 'ftp://google.com');
  });


  it('normalize', function () {
    var l = linkify(), m;

    m = l.match('mailto:foo@bar.com')[0];

    // assert.strictEqual(m.text, 'foo@bar.com');
    assert.strictEqual(m.url,  'mailto:foo@bar.com');

    m = l.match('foo@bar.com')[0];

    // assert.strictEqual(m.text, 'foo@bar.com');
    assert.strictEqual(m.url,  'mailto:foo@bar.com');
  });


  it('test @twitter rule', function () {
    var l = linkify().add('@', {
      validate: function (text, pos, self) {
        var tail = text.slice(pos);

        if (!self.re.twitter) {
          self.re.twitter =  new RegExp(
            '^([a-zA-Z0-9_]){1,15}(?!_)(?=$|' + self.re.src_ZPCc + ')'
          );
        }
        if (self.re.twitter.test(tail)) {
          if (pos >= 2 && tail[pos - 2] === '@') {
            return false;
          }
          return tail.match(self.re.twitter)[0].length;
        }
        return 0;
      },
      normalize: function (m) {
        m.url = 'https://twitter.com/' + m.url.replace(/^@/, '');
      }
    });

    assert.strictEqual(l.match('hello, @gamajoba_!')[0].text, '@gamajoba_');
    assert.strictEqual(l.match(':@givi')[0].text, '@givi');
    assert.strictEqual(l.match(':@givi')[0].url, 'https://twitter.com/givi');
    assert.ok(!l.test('@@invalid'));
  });


  it('set option: fuzzyLink', function () {
    var l = linkify({ fuzzyLink: false });

    assert.strictEqual(l.test('google.com.'), false);

    l.set({ fuzzyLink: true });

    assert.strictEqual(l.test('google.com.'), true);
    assert.strictEqual(l.match('google.com.')[0].text, 'google.com');
  });


  it('set option: fuzzyEmail', function () {
    var l = linkify({ fuzzyEmail: false });

    assert.strictEqual(l.test('foo@bar.com.'), false);

    l.set({ fuzzyEmail: true });

    assert.strictEqual(l.test('foo@bar.com.'), true);
    assert.strictEqual(l.match('foo@bar.com.')[0].text, 'foo@bar.com');
  });


  it('set option: fuzzyIP', function () {
    var l = linkify();

    assert.strictEqual(l.test('1.1.1.1.'), false);

    l.set({ fuzzyIP: true });

    assert.strictEqual(l.test('1.1.1.1.'), true);
    assert.strictEqual(l.match('1.1.1.1.')[0].text, '1.1.1.1');
  });

  it('should not hang in fuzzy mode with sequences of astrals', function () {
    var l = linkify();

    l.set({ fuzzyLink: true });

    l.match('😡😡😡😡😡😡😡😡😡😡😡😡😡😡😡😡😡😡😡😡😡😡😡😡😡😡😡😡😡😡😡😡😡😡😡 .com');
  });


  it('should accept `---` if enabled', function () {
    var l = linkify();

    assert.strictEqual(l.match('http://e.com/foo---bar')[0].text, 'http://e.com/foo---bar');
    assert.strictEqual(l.match('text@example.com---foo'), null);

    l = linkify(null, { '---': true });

    assert.strictEqual(l.match('http://e.com/foo---bar')[0].text, 'http://e.com/foo');
    assert.strictEqual(l.match('text@example.com---foo')[0].text, 'text@example.com');
  });

  it('should find a match at the start', function () {
    var l = linkify();

    l.set({ fuzzyLink: true });

    assert.strictEqual(l.matchAtStart('http://google.com 123').text, 'http://google.com');
    assert.ok(!l.matchAtStart('google.com 123'));
    assert.ok(!l.matchAtStart('  http://google.com 123'));
  });

  it('matchAtStart should not interfere with normal match', function () {
    var l = linkify();
    var str;

    str = 'http://google.com http://google.com';
    assert.ok(l.matchAtStart(str));
    assert.strictEqual(l.match(str).length, 2);

    str = 'aaa http://google.com http://google.com';
    assert.ok(!l.matchAtStart(str));
    assert.strictEqual(l.match(str).length, 2);
  });

  it('should not match incomplete links', function () {
    // regression test for https://github.com/markdown-it/markdown-it/issues/868
    var l = linkify();

    assert.ok(!l.matchAtStart('http://'));
    assert.ok(!l.matchAtStart('https://'));
  });
});
