/**
 * Fails the build when src/lib/dealer.ts still holds placeholder identity
 * data and the build is a production one. See assertRealDealerData there
 * for why this is a hard failure rather than a warning.
 *
 * Runs via `npm run check:dealer`, wired into `prebuild`.
 */
import { execFileSync } from 'node:child_process'

const src = `
  import { assertRealDealerData, placeholderProblems } from './src/lib/dealer.ts'
  const problems = placeholderProblems()
  if (problems.length === 0) {
    console.log('check:dealer — real dealer data present.')
  } else if (process.env.VERCEL_ENV === 'production' || process.env.REQUIRE_REAL_DEALER_DATA === 'true') {
    assertRealDealerData()
  } else {
    console.log('check:dealer — ' + problems.length + ' placeholder field(s); allowed outside production:')
    for (const p of problems) console.log('  • ' + p)
  }
`

try {
  execFileSync(process.execPath, ['--experimental-strip-types', '--input-type=module', '--eval', src], {
    stdio: 'inherit',
  })
} catch {
  process.exit(1)
}
