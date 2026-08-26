# SPOYLT — Start a Proposition On Your Leisurely Time

**Landing page + interactive demo** for a civic action platform.

> We are spoiled. We want all the laws to work for us. When they don’t, it’s time to get the word out and put the lawmakers on notice.

## Features in this demo

- **Geolocation** — Detects user location (OpenStreetMap Nominatim) and personalizes the board
- **Issue categories**: Housing Crisis, High Gas Prices, Protection from Fires, Street Potholes, Police Protection, Animal Services, Food Banks Funding
- **Start a Proposition** form → submits to a live Community Board (likes / support / comments)
- **Community Board** with seed data + localStorage persistence
- **Public Officials** section + dedicated pricing tier
- **Pricing**
  - Citizen: **5 free Spoylts / month**
  - Unlimited: **$10 / month**
  - Public Officials: **$25 / month**
- Ready for **Stripe** Checkout + **Supabase** (auth, DB, realtime)
- **Community Firewall** — detects fake accounts, vulgar / racist / sexist language, and romance-scam patterns. Hard violations permanently block the origin email **on SPOYLT** and delete that user’s board content. (Does not delete the person’s Gmail/Outlook mailbox.)

## Quick start (static demo)

Just open `index.html` in a browser (or serve the folder):

```bash
npx serve .
# or
python3 -m http.server 8080
```

Geolocation and reverse-geocoding require a network connection.

## Production backend (Supabase + Stripe)

### 1. Supabase

1. Create a project at [supabase.com](https://supabase.com)
2. Tables (suggested schema):

```sql
-- profiles (extends auth.users)
create table profiles (
  id uuid references auth.users primary key,
  full_name text,
  role text check (role in ('citizen', 'official')) default 'citizen',
  district text,
  verified_official boolean default false,
  created_at timestamptz default now()
);

-- propositions
create table propositions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id),
  category text not null,
  title text not null,
  suggestion text not null,
  location_city text,
  location_region text,
  lat float,
  lng float,
  likes int default 0,
  supports int default 0,
  comments_count int default 0,
  created_at timestamptz default now()
);

-- blocked origin emails (platform ban — not an inbox delete)
create table blocked_emails (
  email_normalized text primary key,
  email_original text,
  reasons text[] not null,
  permanent boolean default true,
  blocked_at timestamptz default now(),
  notes text
);

-- firewall audit log
create table firewall_events (
  id uuid primary key default gen_random_uuid(),
  email_normalized text,
  action text check (action in ('CONTENT_REJECTED', 'PERMANENT_BLOCK', 'PURGE_CONTENT')),
  reasons text[],
  snippet text,
  created_at timestamptz default now()
);

-- interactions
create table interactions (
  id uuid primary key default gen_random_uuid(),
  proposition_id uuid references propositions(id) on delete cascade,
  user_id uuid references profiles(id),
  type text check (type in ('like', 'support', 'comment')),
  body text, -- for comments
  created_at timestamptz default now(),
  unique(proposition_id, user_id, type) -- one like/support per user
);
```

3. Enable Row Level Security and policies so users can only insert their own propositions and interact once.
4. Use Supabase Realtime on `propositions` and `interactions` for live board updates.
5. Track monthly Spoylt count per user (or use a `usage` table) to enforce the free tier of 5/month.
6. Run `SpoyltFirewall.inspect()` (or a Supabase Edge Function with the same rules) **before insert**. On `blockEmail`, insert into `blocked_emails`, delete the user’s propositions/comments, and ban the Auth user so that email cannot sign up again.

### Community Firewall (client + server)

`js/firewall.js` is the first line of defense in the demo. Production must enforce the same rules on the server:

| Signal | Action |
|---|---|
| Disposable / randomized email, banned address | Permanent platform block |
| Racist or sexist language | Delete content + permanent email block |
| Romance-scam patterns (money rails + love/military/inheritance bait) | Delete content + permanent email block |
| Vulgar language only | Reject the post; allow a clean rewrite |

**Scope of “delete origin email”:** SPOYLT permanently blocks and cannot reuse that email on this product. It does **not** reach into Google, Microsoft, or any other mail provider.

### 2. Stripe

1. Create Products + Prices in Stripe Dashboard:
   - Unlimited → $10 / month recurring
   - Public Official → $25 / month recurring
2. Use Stripe Checkout or Customer Portal.
3. Webhook endpoint (e.g. Supabase Edge Function or your API) to:
   - Mark user as `unlimited` or `official` on `checkout.session.completed`
   - Handle cancellations / failed payments
4. Client-side: replace the demo toast buttons with calls to your `/api/create-checkout-session` that returns a Stripe Checkout URL.

### 3. Auth flow

- Citizens: email magic link or OAuth via Supabase Auth
- Officials: same + manual verification (or domain allow-list / government email) before `verified_official = true`

## File structure

```
spoylt/
├── index.html          # Landing page
├── js/
│   └── app.js          # Geolocation, form, board, localStorage demo
└── README.md
```

## Next steps

- Replace localStorage with Supabase client (`@supabase/supabase-js`)
- Add real comments UI + nested replies
- District matching for officials (geofence or ZIP / council district lookup)
- Email / push notifications when an official responds
- Share cards (Open Graph) for viral Spoylts

---

Built for citizens who refuse to stay silent.
