/**
 * Dealer identity constants used across the site: header, footer, home page
 * trust strip, VDP JSON-LD, and the sticky call bar.
 *
 * PLACEHOLDER DATA: the client intake questionnaire (docs/client-intake-
 * questions.md, section 1, the starred/blocking items) has not been
 * answered yet -- no real address, phone number, or hours exist. The
 * values below are clearly-fictional placeholders (555 exchange, generic
 * frontage-road address) so the site renders convincingly without
 * impersonating a real business. Replace with real values as soon as the
 * client answers questions 1-9.
 */
export const SITE_URL = 'https://www.roadstarautosales.example'

export const DEALER = {
  name: 'Roadstar Auto Sales',
  tagline: 'Buy Here Pay Here — Austin, Texas',
  phoneDisplay: '(512) 555-0182',
  phoneTel: 'tel:+15125550182',
  smsHref: 'sms:+15125550182',
  email: 'info@roadstarautosales.example',
  address: {
    street: '3210 S I-35 Frontage Rd',
    city: 'Austin',
    state: 'TX',
    zip: '78741',
  },
  mapsHref: 'https://maps.google.com/?q=3210+S+I-35+Frontage+Rd,+Austin,+TX+78741',
  hours: [
    { day: 'Monday', hours: '9:00 AM – 7:00 PM' },
    { day: 'Tuesday', hours: '9:00 AM – 7:00 PM' },
    { day: 'Wednesday', hours: '9:00 AM – 7:00 PM' },
    { day: 'Thursday', hours: '9:00 AM – 7:00 PM' },
    { day: 'Friday', hours: '9:00 AM – 7:00 PM' },
    { day: 'Saturday', hours: '9:00 AM – 6:00 PM' },
    { day: 'Sunday', hours: 'Closed' },
  ],
} as const

export const fullAddress = `${DEALER.address.street}, ${DEALER.address.city}, ${DEALER.address.state} ${DEALER.address.zip}`
