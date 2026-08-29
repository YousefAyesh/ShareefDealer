import type { Metadata } from 'next'
import { LegalPage } from '@/components/LegalPage'
import { DEALER, SITE_URL } from '@/lib/dealer'

export const metadata: Metadata = {
  title: 'Accessibility',
  description: `${DEALER.name}'s commitment to keeping this website usable for everyone, and how to report a problem.`,
  alternates: { canonical: `${SITE_URL}/accessibility` },
}

/**
 * Dealer websites are one of the most-targeted categories in ADA web
 * accessibility litigation -- over 5,000 such suits were filed in federal
 * court in 2025, and independent dealers are common defendants because
 * their sites are usually template-built and never tested.
 *
 * This page is not a legal shield by itself. What it does is give a real
 * person a real way to report a barrier and get it fixed, which is both the
 * point of the exercise and the single most useful piece of evidence that
 * the business is acting in good faith. The phone number here has to be one
 * someone actually answers.
 */
export default function AccessibilityPage() {
  return (
    <LegalPage title="Accessibility" href="/accessibility" lastUpdated="2026-08-28">
      <p>
        We want everyone to be able to shop for a vehicle on this site, including people who use
        screen readers, keyboard navigation, screen magnification, or voice control.
      </p>

      <h2>What we&apos;ve done</h2>
      <p>This site was built with accessibility in mind rather than retrofitted. Specifically:</p>
      <ul>
        <li>Every page works with a keyboard alone, and the focused element is always visibly outlined.</li>
        <li>
          Filtering and browsing inventory works without JavaScript, so the site stays usable on
          assistive technology and older browsers.
        </li>
        <li>Vehicle photographs carry descriptive alternative text.</li>
        <li>Form controls have real, associated labels rather than placeholder text standing in for them.</li>
        <li>
          Text and interface colors are checked against the WCAG 2.1 AA contrast minimums, and tap
          targets are at least 44&nbsp;pixels tall.
        </li>
        <li>Animation is limited, and is reduced further for visitors whose device requests reduced motion.</li>
        <li>Page structure uses real headings and landmarks, with a skip link to jump past the navigation.</li>
      </ul>
      <p>
        We aim to conform to the Web Content Accessibility Guidelines (WCAG) 2.1 Level AA. Parts of
        the site rely on third-party content, such as the embedded map on the Visit Us page, whose
        accessibility we do not control. The address and phone number are always available as plain
        text so that map is never the only way to reach us.
      </p>

      <h2>Found a problem? Tell us</h2>
      <p>
        If any part of this site is difficult or impossible for you to use, we want to hear about it,
        and we will fix it. Please tell us what page you were on and what happened.
      </p>
      <p>
        Call <a href={DEALER.phoneTel}>{DEALER.phoneDisplay}</a> or email{' '}
        <a href={`mailto:${DEALER.email}`}>{DEALER.email}</a>. We aim to respond within two business
        days.
      </p>

      <h2>We can help you another way</h2>
      <p>
        If you would rather not use the website at all, call us and we will read you the details,
        mileage and price of any vehicle on the lot, send you photographs however works best for you,
        and arrange for you to see the car in person.
      </p>
    </LegalPage>
  )
}
