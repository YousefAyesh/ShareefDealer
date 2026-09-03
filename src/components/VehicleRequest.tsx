import { DEALER, smsHrefWithBody } from '@/lib/dealer'
import { MessageIcon, PhoneIcon } from './icons'

/**
 * "Don't see what you're looking for?" — the catch for a shopper who
 * browsed the whole lot and did not find their car.
 *
 * Deliberately NOT a form. A name-and-email capture would make the privacy
 * policy false (it states plainly that this site collects nothing), and a
 * weekly marketing email carries CAN-SPAM obligations -- unsubscribe link,
 * physical address, honouring opt-outs within ten days -- that a static
 * site with no backend cannot meet. A pre-filled text costs the shopper one
 * tap, reaches the owner where he already answers, and collects nothing.
 *
 * The text button only renders when the dealer's line actually accepts SMS
 * (intake question 5); otherwise this falls back to the phone alone, for
 * the same reason StickyCallBar does.
 */
export function VehicleRequest() {
  const smsHref = smsHrefWithBody(
    "Hi! I'm on your website and I'm looking for a ",
  )

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

      <div className="mx-auto mt-6 flex w-full max-w-md flex-col gap-3 sm:flex-row">
        {smsHref && (
          <a
            href={smsHref}
            className="flex min-h-12 flex-1 cursor-pointer items-center justify-center gap-2 rounded-md bg-red px-5 text-base font-bold text-cream hover:bg-red-dark"
          >
            <MessageIcon className="h-5 w-5" />
            Text us what you want
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
