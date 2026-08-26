# Domain names

Candidates checked, so the same ground is not covered twice. Availability is
from DNS lookups — an absent NS record strongly suggests a domain is
unregistered but is not proof, so confirm at a registrar before buying.

Last checked 2026-08-26.

## The constraint worth stating first

The name is profane, which is the brand's strength and its distribution
problem. People cannot type it at work, app stores are uneasy about it, and the
obvious domains were taken years ago.

A clean domain with a profane page title is a perfectly good split. The
branding does not have to live in the URL.

## Ruled out

| Domain | Why |
| --- | --- |
| `getinthefuckingsea.com` / `.co.uk` | Both registered, GoDaddy nameservers — parked by someone who had the same idea |
| `getinthesea.com` / `.co.uk` | Parked |
| `shorecast.*` | **A live product in this exact space.** `shorecast.app` serves a site called Shorecast; `shorecast.co.uk` is "Shorecast — Your Beaches". `.com` is listed for sale on Dan. Only `.surf`, `.org` and `.dev` are free, and taking one alongside their `.app` would invite confusion |
| `gitfs.com` | Parked and for sale |
| `swimmable.co.uk`, `coldwater.uk`, `seaworthy.uk` | Registered |
| `intothesea.co.uk`, `goonthen.co.uk`, `shorecasts.com` | Registered |

## Available, and worth considering

| Domain | The case for it |
| --- | --- |
| **`getin.surf`** | The pick. A complete phrase across the dot, short, and it speaks to the whole audience rather than swimmers alone. The TLD does real work instead of being a gimmick |
| `gitfs.uk` / `.co.uk` / `.app` / `.org` | Shortest possible and matches the repository. But `gitfs` reads as "git filesystem" to any developer seeing it cold, and it cannot be said aloud |
| `shouldiswim.co.uk` / `.com` | Says exactly what the app does, safe anywhere, good for search. Less fun |
| `wetsuitornot.com` | Decision-framing, very on-message with the verdict |
| `swimornot.com` | The same, blunter |
| `hellyeah.surf` | Fun, but names one verdict of four |
| `theshorecast.com`, `getshorecast.com`, `shorecast.me` | Free, but see above — the confusion is the problem, not the availability |
| `seastate.uk`, `bracing.uk`, `seayes.co.uk`, `inthedrink.co.uk` | Quieter, more general |
| `dipornot.com`, `shouldigetin.com`, `isitswimmable.com` | Free |

## Things to weigh

- **`.surf` costs meaningfully more than `.uk`** — roughly £25 to £40 a year
  against about £8.
- **There is no urgency.** `turpin.dev/gitfs` works today, and pointing a new
  domain at the same Pages site later is a DNS record and one line in the repo.
- **Check for an existing product, not just an existing registration.** Shorecast
  looked like a good idea until the `.app` turned out to be somebody's working
  beach forecast.

## How these were checked

```sh
dig +short NS example.com          # registered if it answers
curl -sL -o /dev/null -w '%{http_code}' https://example.com   # live if it serves
```

WHOIS is more authoritative than DNS but was blocked from the development
machine, so nothing here has been confirmed at a registrar.
