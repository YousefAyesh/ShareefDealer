import type { Metadata } from 'next'
import { LegalPage } from '@/components/LegalPage'
import { DEALER, SITE_URL, fullAddress } from '@/lib/dealer'

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: `How ${DEALER.name} handles information collected through this website.`,
  alternates: { canonical: `${SITE_URL}/privacy` },
}

/**
 * ⚠️  REVIEW BEFORE LAUNCH.
 *
 * This policy is written to describe what this site *actually does today*,
 * which is unusually little: there are no lead forms, no analytics, no
 * advertising pixels, no account system, and no cookies set by us. Fonts
 * are self-hosted by next/font at build time, so no request reaches Google
 * for them. The only third party a visitor's browser contacts is Google
 * Maps, and only on the Visit Us page.
 *
 * That makes it accurate, but it also makes it FRAGILE: the moment anyone
 * adds Google Analytics, a Meta pixel, a chat widget, or a "check
 * availability" form, this document becomes false. Several state privacy
 * laws attach real penalties to a privacy policy that misdescribes
 * collection, so treat adding any of those as also requiring an edit here.
 *
 * It has not been reviewed by a lawyer. Have counsel or the state dealer
 * association read it before launch -- state dealer advertising rules add
 * disclosure requirements this template does not attempt to guess at
 * (intake question 48).
 */
export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" href="/privacy" lastUpdated="2026-08-28">
      <p>
        This policy explains what happens to information when you use this website. It covers this
        website only — information you give us in person, over the phone, or by text is handled
        separately, and any credit or purchase paperwork you fill out at the dealership is covered by
        the notices we give you at that time.
      </p>

      <h2>What this website collects</h2>
      <p>
        This website has no contact forms, no accounts, and no newsletter signup. There is nothing
        here for you to fill in, so we do not collect names, addresses, phone numbers, email
        addresses or any other personal details through it.
      </p>
      <p>
        Like essentially every website, our hosting provider keeps standard server logs of requests
        made to the site. These typically include your IP address, the page requested, the time of
        the request, and your browser&apos;s user-agent string. We use these only to keep the site
        running and to investigate errors and abuse.
      </p>

      <h2>Cookies and tracking</h2>
      <p>
        We do not set advertising or analytics cookies on this site. We do not run Google Analytics,
        advertising pixels, session recording, or a chat widget.
      </p>

      <h2>Third parties</h2>
      <p>
        The Visit Us page embeds a Google Map so you can get directions. Loading that page causes
        your browser to contact Google, which may set its own cookies and receive your IP address.
        That interaction is governed by{' '}
        <a href="https://policies.google.com/privacy" rel="noopener noreferrer" target="_blank">
          Google&apos;s privacy policy
        </a>
        , not this one. No other page on this site loads third-party content.
      </p>
      <p>
        Vehicle photographs and details on this site come from our dealer management system. We do
        not sell or share visitor information with data brokers or advertising networks.
      </p>

      <h2>When you call or text us</h2>
      <p>
        Calling or texting the number on this site sends your phone number to us through your carrier
        in the ordinary way. If you text us, we keep the conversation so we can help you, and your
        carrier&apos;s standard message and data rates apply. We will not add you to a marketing text
        list because you asked about a car.
      </p>

      <h2>Children</h2>
      <p>
        This site is not directed at children under 13, and we do not knowingly collect information
        from them.
      </p>

      <h2>Your choices</h2>
      <p>
        Because we do not collect personal information through this website, there is generally
        nothing here for us to look up, correct or delete. Depending on where you live, you may still
        have rights regarding information we hold about you as a customer. To ask about that, contact
        us using the details below and we will respond as required by applicable law.
      </p>

      <h2>Changes</h2>
      <p>
        If we add anything to this site that collects information — a contact form or analytics, for
        example — we will update this policy and change the date at the top before doing so.
      </p>

      <h2>Contact</h2>
      <p>
        {DEALER.name}
        <br />
        {fullAddress}
        <br />
        <a href={DEALER.phoneTel}>{DEALER.phoneDisplay}</a>
        <br />
        <a href={`mailto:${DEALER.email}`}>{DEALER.email}</a>
      </p>
    </LegalPage>
  )
}
