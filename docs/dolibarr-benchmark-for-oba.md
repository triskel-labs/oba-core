# Dolibarr Benchmark Notes for OBA / Tipiti

Date: 2026-07-23  
Source: <https://github.com/Dolibarr/dolibarr>  
Status: reference benchmark, not implementation target

## 0. Why this repo matters

Dave found Dolibarr as a useful image of what a mature business operating system/ERP can become.

That framing is right:

> Dolibarr is the **full ERP/CRM universe**. OBA/Tipiti is the **stripped-down outdoor-ops cockpit** we can actually validate now.

Dolibarr is useful to study for:

- feature taxonomy;
- module boundaries;
- permissions;
- import/export;
- configurable business objects;
- admin vs operator separation;
- long-term ERP surface area.

It is not useful as a direct near-term product shape for Tipiti.

## 1. Facts from quick inspection

| Area | Observation |
|---|---|
| Product | Open-source ERP & CRM for organizations: contacts, quotes, invoices, orders, stock, agenda, HR, ECM, manufacturing, etc. |
| Repo | `Dolibarr/dolibarr` |
| License | GPL-3.0 |
| Main stack | PHP + JavaScript/CSS; MariaDB/MySQL/PostgreSQL support |
| Scale | Very large mature codebase; GitHub API reports ~80 top-level `htdocs` app folders and ~100 built-in modules mentioned in README |
| Extension model | Native modules plus marketplace/addons; includes a Module Builder |
| Notable built-ins | Third parties/contacts, products/services, stock/inventory, proposals, orders, invoices/payments, POS, agenda, projects/tasks, HR, tickets/knowledge, imports/exports, REST/SOAP APIs |

Important licensing note:

> Dolibarr is GPL-3. Studying patterns is fine. Copying code into OBA means we must respect GPL obligations and may force incompatible licensing decisions. Treat it as architecture/product reference unless Dave explicitly decides otherwise.

## 2. How Dolibarr organizes the world

Dolibarr has a classic ERP object universe:

1. **Third parties / contacts** — customers, prospects, suppliers, members.
2. **Catalogue** — products and services.
3. **Sales flow** — opportunities/leads → proposals → orders → contracts/subscriptions → invoices/payments.
4. **Purchase flow** — suppliers → purchase orders → receptions → supplier invoices.
5. **Stock/resource layer** — warehouses, inventory, barcodes, batches/lots/serials, BOM/manufacturing.
6. **Collaboration layer** — agenda/calendar, projects/tasks, event organization, tickets, surveys.
7. **HR layer** — staff, leave, expenses, recruitment, timesheets.
8. **Finance/accounting layer** — bank, payments, accounting, margins, reports.
9. **Admin/platform layer** — imports/exports, APIs, permissions, dashboards, module enablement, custom fields.

The useful lesson is not “copy all of this.”

The useful lesson is:

> Mature business software is organized around stable business objects plus optional capability modules.

## 3. Module architecture lessons worth stealing as patterns

Dolibarr module descriptors expose a strong pattern:

| Module descriptor concept | Why it matters for OBA later |
|---|---|
| `family` | Modules grouped into product areas, not just random feature toggles. |
| `depends` / `conflictwith` | Capabilities can require or exclude other capabilities. |
| `const` / config pages | Modules have typed settings and admin surfaces. |
| `rights` / `rights_class` | Permissions are declared per module/action. |
| `menu` | Navigation is generated from enabled capabilities. |
| `cronjobs` | Background jobs belong to modules and are visible/configurable. |
| `module_parts` | Hooks/triggers/models/menus/theme parts are explicit. |
| Import/export declarations | Business data must be portable and inspectable. |

For OBA, this says: if we ever rebuild a module/capability system, it should describe:

```txt
capability
family
owner-facing label
operator-facing surfaces
data objects
permissions
background jobs
message actions
integrations
imports/exports
safe defaults
```

But for Tipiti MVP, this stays internal. Cris/Patri should not see a Dolibarr-like module manager.

## 4. What maps well to outdoor sports operations

| Dolibarr concept | OBA/Tipiti translation |
|---|---|
| Third parties / contacts | Clients, families, partners, instructors, collaborator organizers |
| Products/services catalogue | Service templates: group surf class, private class, rental, surf house, bonos |
| Agenda/calendar | Today agenda, pending schedule, sessions, rental pickup/return, follow-ups |
| Resources | Instructors, boards, wetsuits, Surf House units/rooms |
| Stock/inventory | Material demand/allocation; exact item assignment later |
| Interventions | Field service/session record: what happened, who attended, notes, payment/material state |
| Projects/tasks | Follow-ups, unresolved requests, operational checklists |
| Tickets/knowledge | Customer issues, FAQ/templates, repeated answers |
| Imports/exports | Owner-controlled data, backup/recovery, migration from old OBA/prod DB |
| Cron/notifications | Daily digest, reminders, instructor/customer notifications |
| Permissions | Owner/admin vs manager/operator vs instructor read-only/action-only surfaces |

## 5. What does not fit Tipiti now

| Dolibarr area | Why it is too much / poor fit now |
|---|---|
| Proposals/orders/invoices-first flow | Tipiti classes/rentals are operational-first and often paid in person. |
| Full accounting | Useful someday, not the MVP bottleneck. |
| Supplier/purchase/manufacturing/BOM | Mostly irrelevant to surf school daily operation. |
| Generic module enablement UI | Too engineering-shaped for Cris/Patri. |
| Large ERP navigation | The exact thing we are trying to avoid: too many surfaces before daily value. |
| Heavy CRM pipeline | Tipiti needs requests/bookings/follow-ups, not enterprise sales stages. |

## 6. Better long-term mental model

Dolibarr shows the possible mature destination:

> OBA could eventually become an outdoor/activity-business ERP: CRM + operations + payments + resources + communications + reporting.

But the Tipiti product should grow from the opposite direction:

```txt
Tipiti daily cockpit
→ stable operational records
→ safe message automation
→ imports/exports/backups
→ payments/reporting
→ resource/inventory depth
→ optional accounting/ERP bridges
→ broader OBA product packs
```

Not:

```txt
ERP module universe
→ configure everything
→ hope the operator finds the daily workflow
```

## 7. Practical inspiration for the stripped-down spike

Dolibarr gives us a useful checklist for the new Tipiti cockpit spike:

1. **Stable business objects first** — client, request/booking, agenda item, payment, material need, message action.
2. **Every object has list/card/create/edit** — full CRUD is not optional.
3. **Imports/exports early** — owner control and migration safety.
4. **Permissions early but simple** — owner/admin, manager/operator, instructor notification recipient.
5. **Module/capability metadata later** — only after the cockpit works.
6. **Cron/message actions are first-class** — not invisible background magic.
7. **External integrations as adapters** — WhatsApp/Telegram/calendar/payment should not own the data model.
8. **Custom fields / notes matter** — small businesses need manual override and weird edge cases.

## 8. Recommendation

Use Dolibarr as a **benchmark map**, not a dependency.

Near-term:

- Do not install Dolibarr for Tipiti.
- Do not clone its UX.
- Do not copy GPL code into OBA unless we intentionally accept GPL implications.
- Do inspect specific modules when designing equivalent OBA concepts:
  - `agenda` for calendar/action thinking;
  - `resource` for resource assignments;
  - `bookcal` for booking calendar concepts;
  - `fichinter` for intervention/session records;
  - `ticket` for issue/follow-up/messaging patterns;
  - import/export/admin/permissions for owner control.

The product direction remains:

> Tipiti first gets a clean, game-like field-ops cockpit. Dolibarr remains the far-future ERP shadow on the wall.
