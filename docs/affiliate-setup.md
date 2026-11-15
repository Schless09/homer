# Affiliate network setup

What you need to do (only the account owner can sign up), what to paste into the forms, and what to hand back so products flow into Homer.

Program terms, retailer lists and signup flows change often. Confirm each step on the network's own site.

## 1. Before applying (reviewers check these)

- [ ] **Live site on your own domain.** Deploy to Vercel and attach a domain (e.g. `homer.design`). Reviewers often reject `*.vercel.app` URLs and empty or "coming soon" sites.
- [ ] **Public pages, already built:** `/about`, `/privacy` and `/disclosure`. Set `NEXT_PUBLIC_HOMER_CONTACT_EMAIL` so a contact address shows on About and Privacy.
- [ ] **Real content visible without signing in.** The demo studio and design templates on the dashboard cover this.
- [ ] **Business details:** legal name or company, address, phone, tax form (W-9 in the US), and payout method (bank account or PayPal).
- [ ] **A business email on your domain** (e.g. `partners@yourdomain`). Some networks flag free email addresses.
- [ ] **Some traffic.** Several programs reject brand-new sites with no visitors. Apply anyway, and reapply after launch if declined.

## 2. Networks to apply to

| Network | Apply at | Notes |
|---|---|---|
| **Impact** | impact.com → Partners → sign up | Free. After approval you apply to each brand separately. Many DTC furniture brands are here. |
| **CJ (Commission Junction)** | cj.com → Publishers → sign up | Free. Join advertisers one by one. Large home retailers are common here. |
| **Rakuten Advertising** | rakutenadvertising.com → Publishers | Free. Apply to individual advertisers after approval. |
| **Awin** | awin.com → Publishers → join | Small refundable deposit in some regions. ShareASale programs have been moving into Awin. |
| **Amazon Associates** | affiliate-program.amazon.com | Usually needs qualifying sales within your first 180 days to stay approved. Product API access depends on recent sales. |

Suggested order: **Impact and CJ first** (furniture-heavy, free), then Awin and Rakuten. Add Amazon once you have traffic.

## 3. Copy-paste answers for the forms

**Website / property name:** Homer

**Website URL:** `https://<your-domain>`

**Category:** Home & Garden → Furniture / Home Décor (secondary: Software / Tools)

**Describe your website (short):**
> Homer is an AI interior design and space-planning tool. Users upload their apartment floor plan, and an AI designer furnishes it at true scale in 2D and 3D. Products from retail partners can be placed directly into a user's plan, so shoppers see exactly what fits and how it looks before buying.

**Describe your website (long):**
> Homer helps renters and homeowners furnish their space with confidence. Users upload a floor plan (or start from a sample studio, one-bedroom or two-bedroom), and Homer builds an accurately scaled room. Our AI designer recommends and places furniture using each product's real dimensions, checking walkways, door swings and clearances. Partner products appear in our catalog with their photo, price, dimensions and a link to the retailer. Users place them in their room, view them in 3D, and add them to a shopping list. We send high-intent shoppers who already know the product fits their space.

**How will you promote our products?**
> Product listings inside our space-planning tool: catalog, product detail panel, AI recommendations and the user's shopping list, each with a tracked deep link to the product page. We also use product images and data from the advertiser's feed to show the product at true scale in our 2D/3D planner.

**Promotional methods (check these):** Content/editorial · Product comparison/shopping tool · Deep linking · Product feed / datafeed

**Do NOT check (unless true):** Coupons/deals · Incentivized/loyalty · Email lists · Paid search · Social ads

**Traffic sources:** Organic search, direct, social sharing of designs. *(Report real numbers. Say "newly launched" if you're just starting.)*

**Monthly unique visitors:** your real number.

**Will you bid on brand keywords in paid search?** No.

**Do you use product feeds?** Yes. We import the datafeed daily to show current prices, availability and dimensions.

**Disclosure location:** `https://<your-domain>/disclosure`, plus a notice next to every buy link.

## 4. After approval: what Homer needs

For each approved retailer, get its **product feed URL** (CSV, TSV or JSON). Where to find it varies:

- **Impact:** the brand's *Catalog* (or *Product Feed*) in your account. Use the download/export URL.
- **CJ:** *Product Catalogs* for each joined advertiser, or a product feed export URL.
- **Rakuten:** the advertiser's *Product Catalog*. This is often FTP; ask Rakuten support for an HTTPS link, or download the file and use `npm run feed:import -- --file`.
- **Awin:** *Toolbox → Create-a-Feed* builds an HTTPS CSV URL across all joined advertisers.

Then either:

**A. One-off import** (download the file first):

```bash
npm run feed:import -- --file article.csv --retailer "Article" --network impact
```

**B. Daily automatic sync.** Set these on Vercel (Project → Settings → Environment Variables):

```
HOMER_FEEDS=[{"retailer":"Article","network":"impact","url":"https://…feed.csv"},{"retailer":"West Elm","network":"cj","url":"https://…"}]
HOMER_SUPABASE_SECRET_KEY=<Homer Supabase secret key>
CRON_SECRET=<any long random string>
ANTHROPIC_API_KEY=<optional: reads product photos for 3D looks>
```

`network` must be one of `impact`, `cj`, `rakuten`, `awin`, `shareasale`, `amazon`, `direct`. It controls which sub-ID parameter carries the click ID (`subId1`, `sid`, `u1`, `clickref`, `afftrack`, `ascsubtag`). Amazon also needs `HOMER_AMAZON_ASSOCIATE_TAG`.

Preview a feed before importing: `npm run feed:check -- path/to/feed.csv`.

## 5. Confirming you get paid

1. Click a product's **Buy** button on the live site and complete a test purchase only if the program allows it (many forbid self-purchases; check first).
2. In the network dashboard, open the click/transaction report. The sub-ID column shows Homer's click ID.
3. Match it to `homer_affiliate_clicks.id` in Supabase to see which product and project earned the commission.
