# Candidate flyer submissions

The verified campaign portal supports SPOYLT text templates and private PNG/JPEG/WebP artwork uploads (10 MB maximum). New submissions select 2 by 4 or 3 by 5 proportions and supply candidate name, office, district/zone, message, legal sponsor, election date, and placement area. Previously saved flyers retain the 4 by 5 format.

The requested price is an applicant preference, not a charge authorization. Both sizes use existing area pricing: $149 for areas up to 100,000 people, $299 for larger areas, and $495 for congressional districts. The trusted reviewer confirms geography, population, sponsor, identity, campaign ID, content, and fee before setting `awaiting_payment`. Checkout always reads the reviewed `fee_amount_cents`, never the requested amount.

Artwork uses the private `candidate-flyers` bucket and owner/flyer ID paths. Owners may read their submissions. Other accounts and anonymous users may read only current, reviewed, approved, paid flyer artwork. Submitted artwork cannot be overwritten or deleted from the browser; unattached upload cleanup is permitted for its owner. Public images use short-lived signed URLs.

The checkout function continues to fail closed unless `FLYER_PAYMENTS_ENABLED=true`. Do not enable payments until the live Supabase webhook destination, its `STRIPE_WEBHOOK_SECRET`, and signed live deliveries have been verified. A return from Checkout never publishes an ad by itself.

Validation performed: both template sizes, HTML escaping, sponsor rendering, saved metadata, immutable upload options, image-signature rejection, owner-only pending access, cross-owner isolation, anonymous denial, unverified upload denial, and requested prices remaining separate from reviewed fees. Database fixtures were rolled back.
