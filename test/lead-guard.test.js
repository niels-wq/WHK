'use strict';

var assert = require('assert');
var g = require('../lib/lead-guard');

function ok(fields) {
  return g.classify(fields);
}

// Required: name AND (phone OR email)
assert.strictEqual(ok({ name: '', phone: '0611112233' }).ok, false);
assert.strictEqual(ok({ name: 'Onbekend', phone: '0611112233' }).ok, false);
assert.strictEqual(ok({ name: 'Jan Jansen' }).ok, false);
assert.strictEqual(ok({ name: 'Jan Jansen', phone: '', email: '' }).ok, false);
assert.strictEqual(ok({ name: 'Jan Jansen', phone: '0611112233' }).ok, true);
assert.strictEqual(ok({ name: 'Jan Jansen', email: 'jan@bedrijf.nl' }).ok, true);
assert.strictEqual(ok({ name: 'Jan Jansen', phone: '0611112233' }).notify, true);
assert.strictEqual(ok({ name: 'Jan Jansen', phone: '0611112233' }).status, 'new');

// Email stuffed in phone field is accepted as email
var swapped = ok({ name: 'Jan Jansen', phone: 'jan@bedrijf.nl' });
assert.strictEqual(swapped.ok, true);
assert.strictEqual(swapped.lead.email, 'jan@bedrijf.nl');
assert.strictEqual(swapped.lead.phone, '');

// Honeypot → spam, still ok, no notify
var hp = ok({ name: 'Jan Jansen', phone: '0611112233', website: 'http://spam.test' });
assert.strictEqual(hp.ok, true);
assert.strictEqual(hp.status, 'spam');
assert.strictEqual(hp.notify, false);

// Test names / phones / emails → status=test, no notify
var cases = [
  { name: 'test', phone: '0687654321' },
  { name: 'Asdf Asdf', email: 'a@bedrijf.nl' },
  { name: 'Jan Jansen', phone: '0612345678' },
  { name: 'Jan Jansen', phone: '00000000' },
  { name: 'Jan Jansen', phone: '06-12345678' },
  { name: 'Jan Jansen', email: 'naam@bedrijf.nl' },
  { name: 'Jan Jansen', email: 'test@example.com' },
  { name: 'Jan Jansen', email: 'foo@mailinator.com' }
];
cases.forEach(function (c) {
  var r = ok(c);
  assert.strictEqual(r.ok, true, JSON.stringify(c));
  assert.strictEqual(r.status, 'test', JSON.stringify(c) + ' → ' + r.status);
  assert.strictEqual(r.notify, false, JSON.stringify(c));
});

// Real-looking Dutch lead is not flagged
var real = ok({ name: 'Marieke de Vries', phone: '06-51239876', email: 'm.devries@acme.nl' });
assert.strictEqual(real.status, 'new');
assert.strictEqual(real.notify, true);

console.log('lead-guard tests ok');
