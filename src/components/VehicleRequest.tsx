import { DEALER, smsHrefWithBody } from '@/lib/dealer'
import { MessageIcon, PhoneIcon } from './icons'
import { VehicleRequestForm } from './VehicleRequestForm'

/**
 * "Don't see what you're looking for?" — the catch for a shopper who
 * browsed the whole lot and did not find their car.
 *
 * A short Formspree form (see VehicleRequestForm) asks what they want and
 * how to reach them; each request lands in the owner's email as a one-off
 * lead. It is deliberately NOT a mailing-list signup -- a recurring
 * marketing email carries CAN-SPAM obligations (unsubscribe link, physical
 * address, honouring opt-outs) that a static site cannot meet. The privacy
 * policy describes exactly what this form collects; keep the two in step.
 *
 * The text/call buttons stay underneath for shoppers who would rather not
 * fill anything in. The text button only renders when the dealer's line
 * accepts SMS (intake question 5), for the same reason StickyCallBar does.
 * Setting DEALER.formspreeEndpoint to null removes the form entirely.
 */
export function VehicleRequest() {
  const smsHref = smsHrefWithBody(
    "Hi! I'm on your website and I'm looking for a ",
  )
  const endpoint = DEALER.formspreeEndpoint

  return (
    <section
      aria-labelledby="vehicle-request-heading"
      className="rounded-lg border border-navy/10 bg-white/40 px-6 py-8 text-center"
    >
      <h2
        id="vehicle-request-heading"
        className="font-display text-xl uppercase tracking-tight text-navy sm:text-2xl"
      >
        Don&apos;t see what you&apos;re looking for?
      </h2>
      <p className="mx-auto mt-3 max-w-lg text-navy/70">
        Tell us the make, model and budget you have in mind. Our stock turns over constantly, and
        we&apos;ll get in touch the moment something similar lands on the lot.
      </p>

      {endpoint && <VehicleRequestForm endpoint={endpoint} />}

      {endpoint && <p className="mt-6 text-sm text-navy/60">Rather talk to someone?</p>}
      <div
        className={`mx-auto flex w-full max-w-md flex-col gap-3 sm:flex-row ${endpoint ? 'mt-3' : 'mt-6'}`}
      >
        {smsHref && (
          <a
            href={smsHref}
            className={`flex min-h-12 flex-1 cursor-pointer items-center justify-center gap-2 rounded-md px-5 text-base font-bold ${endpoint ? 'border-2 border-navy text-navy hover:bg-navy hover:text-cream' : 'bg-red text-cream hover:bg-red-dark'}`}
          >
            <MessageIcon className="h-5 w-5" />
            {endpoint ? 'Text us' : 'Text us what you want'}
          </a>
        )}
        <a
          href={DEALER.phoneTel}
          className={`flex min-h-12 flex-1 cursor-pointer items-center justify-center gap-2 rounded-md border-2 border-navy px-5 text-base font-bold text-navy hover:bg-navy hover:text-cream ${smsHref ? '' : 'sm:mx-auto'}`}
        >
          <PhoneIcon className="h-5 w-5" />
          Call {DEALER.phoneDisplay}
        </a>
      </div>
    </section>
  )
}
