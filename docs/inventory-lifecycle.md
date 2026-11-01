# Inventory lifecycle

`available = onHand - reserved` using thousandths of the unit.

| Event                | On hand delta |    Reserved delta |
| -------------------- | ------------: | ----------------: |
| Request 3 units      |             0 |                 0 |
| Merchant accepts     |             0 |             +3000 |
| Verified pickup      |         -3000 |             -3000 |
| Cancel/reject/expire |             0 | -3000 if reserved |

For 20 pieces, onHand=20000. Accepting three leaves available=17000. Pickup leaves onHand=17000 and reserved=0. Conditional SQL only reserves when `onHand-reserved >= requested`. All item reservations and the order transition share one transaction, so failure rolls back every item.

Rows are processed in deterministic variant-ID order. Manual negative adjustments cannot consume reservations. Every reserve, release, sale and stock adjustment records an immutable movement. When a sale/release leaves available at or below the configured threshold, a notification is stored for the shop owner.

Offline sales must be recorded with inventory adjustments. Stock cannot remain accurate when merchants sell offline without recording those sales or integrating a POS system.
