import type { Metadata } from 'next'
import { LegalPage } from '@/components/LegalPage'
import { DEALER, SITE_URL, fullAddress } from '@/lib/dealer'

export const metadata: Metadata = {
  title: 'Terms of Use',
  description: `Terms governing use of the ${DEALER.name} website.`,
  alternates: { canonical: `${SITE_URL}/terms` },
}

/**
 * ⚠️  REVIEW BEFORE LAUNCH — see the note in privacy/page.tsx.
 *
 * The substance that actually matters here is the pricing and availability
 * disclaimer: inventory is synced from the dealer management system on a
 * schedule, so there is always a window in which the site shows a car that
 * just sold or a price that just changed. Saying so plainly is both honest
 * and the thing that keeps a stale listing from being read as a bait
 * advertisement.
 */
export default function TermsPage() {
  return (
    <LegalPage title="Terms of Use" href="/terms" lastUpdated="2026-08-28">
      <p>
        By using this website you agree to these terms. If you do not agree with them, please do not
        use the site.
      </p>

      <h2>Vehicle information</h2>
      <p>
        Vehicle listings on this site are generated automatically from our dealer management system
        and are refreshed periodically. We work to keep them accurate, but we do not guarantee that
        any listing is complete, current or error-free.
      </p>
      <p>
        In particular: a vehicle shown as available may have sold since the last update, and a price
        shown may have changed. Please confirm availability and price with us before making the trip.
        Nothing on this site is an offer to sell, and we reserve the right to correct any error in a
        listing.
      </p>

      <h2>Pricing</h2>
      <p>
        Listed prices exclude tax, title, license and dealer fees unless a listing says otherwise.
        Prices apply to the specific vehicle shown. We do not compute, estimate or advertise financing
        terms on this website.
      </p>

      <h2>Vehicle condition</h2>
      <p>
        Mileage, options, equipment and specifications shown on this site are believed accurate but
        are not guaranteed, and some details are derived automatically from the vehicle
        identification number rather than inspected. Vehicles are used and are sold subject to the
        warranty terms disclosed on the vehicle&apos;s buyer&apos;s guide at the dealership. We
        encourage you to inspect any vehicle in person, and to have an independent mechanic inspect
        it, before you buy.
      </p>

      <h2>Photographs</h2>
      <p>
        Photographs show the actual vehicle unless a listing states otherwise. Colors can appear
        differently on different screens.
      </p>

      <h2>Intellectual property</h2>
      <p>
        The content, design and photographs on this site belong to {DEALER.name} or are used with
        permission. You may not copy or republish them commercially — including scraping listings for
        another site — without our written permission.
      </p>

      <h2>Third-party links</h2>
      <p>
        Some pages link to or embed third-party services, such as Google Maps. We are not responsible
        for their content or practices.
      </p>

      <h2>Limitation of liability</h2>
      <p>
        This website is provided &ldquo;as is.&rdquo; To the fullest extent permitted by law, we are
        not liable for any loss arising from your use of, or inability to use, this site or from
        reliance on information published on it. This does not limit any right you have under
        consumer protection law, and it does not affect the terms of any purchase agreement you sign
        with us.
      </p>

      <h2>Changes</h2>
      <p>
        We may update these terms. The date at the top of this page shows when they last changed.
      </p>

      <h2>Contact</h2>
      <p>
        {DEALER.name}
        <br />
        {fullAddress}
        <br />
        <a href={DEALER.phoneTel}>{DEALER.phoneDisplay}</a>
        {DEALER.licenseNumber && (
          <>
            <br />
            Dealer License #{DEALER.licenseNumber}
          </>
        )}
      </p>
    </LegalPage>
  )
}
