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
 * which is unusually little: one vehicle-request form posting to Formspree
 * (VehicleRequestForm), no analytics, no advertising pixels, no account
 * system, and no cookies set by us. Fonts are self-hosted by next/font at
 * build time, so no request reaches Google for them. The only third
 * parties a visitor's browser contacts are Google Maps (Visit Us page
 * only) and Formspree (only when the form is submitted).
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
    <LegalPage title="Privacy Policy" href="/privacy" lastUpdated="2026-10-03">
      <p>
        This policy explains what happens to information when you use this website. It covers this
        website only — information you give us in person, over the phone, or by text is handled
        separately, and any credit or purchase paperwork you fill out at the dealership is covered by
        the notices we give you at that time.
      </p>

      <h2>What this website collects</h2>
      <p>
        This website has one form: the &ldquo;Don&apos;t see what you&apos;re looking for?&rdquo;
        form on the home and inventory pages. If you choose to fill it in, we receive the vehicle
        you describe, your budget if you give one, your name, your phone number, and your email
        address if you give one. We use that only to contact you about vehicles matching your
        request. We do not add you to a mailing list, and we do not sell or share it. If you would
        like us to stop contacting you or delete your request, just tell us by phone, text or email.
      </p>
      <p>
        Apart from that form, the site has no accounts and no newsletter signup, and we do not
        collect personal details through it.
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
        , not this one.
      </p>
      <p>
        When you submit the vehicle request form, it is delivered to us by Formspree, a form
        processing service, which forwards it to our email. Formspree receives what you entered along
        with your IP address and browser details, and handles it under{' '}
        <a href="https://formspree.io/legal/privacy-policy/" rel="noopener noreferrer" target="_blank">
          Formspree&apos;s privacy policy
        </a>
        . Nothing is sent to Formspree unless you press the submit button.
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
        If you sent us a vehicle request, you can ask us to correct or delete it at any time.
        Depending on where you live, you may also have other rights regarding information we hold
        about you as a customer. To ask about any of this, contact us using the details below and we
        will respond as required by applicable law.
      </p>

      <h2>Changes</h2>
      <p>
        If we add anything else to this site that collects information — another form or analytics,
        for example — we will update this policy and change the date at the top before doing so.
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
