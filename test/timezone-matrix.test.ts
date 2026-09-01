import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// W-4412 and JOB D shipped three times because every test ran on a UK clock and
// therefore agreed with the bug. This is the check that was missing: the same
// work orders rendered under clocks that disagree with Europe/London in
// different directions. UTC is what the servers run. New York is behind us.
// Sydney and Kiritimati are far enough ahead to be on a different calendar date
// for most of our working day.
//
// TZ has to be varied by spawning a child process. Reassigning process.env.TZ
// part way through a run is not reliable across platforms.
const ZONES = [
  'UTC',
  'Europe/London',
  'America/New_York',
  'Australia/Sydney',
  'Pacific/Kiritimati',
];

const RUNNER = fileURLToPath(new URL('./helpers/print-slots.ts', import.meta.url));

function slotsUnder(timeZone: string): string {
  return execFileSync(process.execPath, ['--experimental-strip-types', RUNNER], {
    env: { ...process.env, TZ: timeZone },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
}

test('every slot renders identically whatever clock the box is on', () => {
  const [reference, ...others] = ZONES.map((zone) => ({ zone, output: slotsUnder(zone) }));

  for (const other of others) {
    assert.equal(
      other.output,
      reference.output,
      `TZ=${other.zone} rendered different slots to TZ=${reference.zone}`,
    );
  }
});

test('the matrix is actually rendering the late job it exists to protect', () => {
  // A guard on the guard. If the runner ever stops emitting W-5006, the test
  // above would happily pass on five identical empty strings.
  const output = slotsUnder('UTC');
  assert.match(output, /"workOrderId": "W-5006"/);
  assert.match(output, /"date": "2026-09-03"/);
});
