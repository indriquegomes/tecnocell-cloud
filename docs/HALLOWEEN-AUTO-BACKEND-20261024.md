# Halloween automatic margin backend — 2026-10-24

Unpublished migrations: `20261024190000_halloween_auto_margin.sql` and `20261024200000_halloween_store_prizes.sql`. No remote database, company fixtures, frontend, commit or publication was used.

## PDV contract

`halloween_pdv_rules(text)` is service-only and returns the agreed JSON array. Exact active product codes are resolved to ERP IDs; duplicate active codes suppress/reject a rule. Rule IDs `halloween-2026:1` through `:11`, version1. Active campaign plus original window+48h, or a still-live ticket/coupon/reissue, permits manual item selection. Giro dates do not change.

`finalizar_venda_halloween` has the twelve original arguments followed by `p_operation uuid,p_tabela_id text`. It checks active canonical store, exact rule/version, server product/table quantity-tier base (NULL minimum means1), rounded unit discount and rejects cost consultation tables/duplicate products. Selected rows cannot have other promotion totals. Header `p_desconto` must exactly equal bounded `promotion_discount_total` on NON-Halloween rows; residual general discount rejects.

The existing finalizer is called exactly once. After it returns, in that same transaction, other-product promotions are moved into their OWN persisted `total_item`; header desconto is set0. The exact line total is authoritative; `desconto_item` gains the rounded unit equivalent for display. For quantity3/discount20, line total280 remains exact while unit discount6.67 is necessarily approximate. History should derive exact total discount from base*quantity-total_item. The invariant is sum(line totals)=sale total-original payment fees. Inventory, payments and ledger are not run again. Halloween snapshot revenue remains its own after-discount item total, excluding fees.

The operation retains the complete canonical JSON payload and unique row lock. Identical retry returns the stored result plus `jaExistia:true,vendedor_nome`; changed payload rejects. `halloween_margin_replay(p_operation,p_actor,p_request)` is service-only, returns NULL if absent, otherwise checks exact payload and actor (array index7) and returns the same replay marker. Request shape:

`[itens,pagamentos,pessoa_id,desconto,observacoes,deposito_id,series,vendedor_id,vendedor_nome,credito_valor,tipo_entrega,endereco_entrega,tabela_id]`

Replay precedes date/price checks. Root action authorizes actor before calling and must skip all post-success mutations for replay.

## Margin reconciliation

Only explicitly snapshotted selected rows count. Missing/nonpositive cost stays pending, never zero cost. Existing `sale_paid` excludes unpaid/F9 pending receivables until payment evidence releases them. Cancelled sales reverse fully. Actual concluded returned quantities reverse original revenue/cost cents, never current catalog amounts. Missing return item evidence or excessive quantities remains pending. Duplicate sale products are forbidden because real return rows identify product, not original item. Fees, taxes and expenses never enter gross margin.

Per-store total latches at >=700 only with no pending items. `unlocked_at`/`unlocked_margin` never clear on later refunds. State reconciles first; product/sale cost and margin are NULL if any constituent is pending. Store totals remain full campaign totals even when detail filters are set. Audited staff `halloween_margin_correct_cost` corrects historical snapshot cost with a reason; no checkout form is required.

Checkout persists snapshots only: it never invokes the reconciler, scans campaign history or acquires the margin advisory lock. One shared idempotent reconciler powers state, service RPC and a minute cron job when pg_cron already exists. Absent extension is explicitly reported in state. This is an O(number of campaign snapshots + relevant return/payment evidence) scan for the small campaign, never executed by spin. New privileged operations configure runtime lock_timeout3s and statement_timeout10s. The actual 3s lock bound is tested. PostgreSQL function-local statement_timeout is not claimed to bound the whole RPC: gateway/session/cron caller must also establish the 10s statement context externally.

## Store prizes and surprise

Private `store_prizes` maps campaign+canonical ERP store UUID+slot. Names resolve stores during migration; no public URL selects allocation. Every new allocation starts quantity0, remaining0, disabled. Existing global scarce quantities are NEVER copied or multiplied. Petrópolis retains existing original names. Teresópolis slot12 is KIT CHAVE YAXUN COMPLETO YX-6028 (05090), slot13 VENTOSA COMPLETA PROFISSIONAL YAXUN YX-A34 (12151), both free100%. ERP/reference stock/prices are not taken as physical campaign confirmation.

`halloween_store_prizes_state(p_campaign)` returns array `{store_id,store_name,slot,code,name,quantity,remaining,enabled}`. `halloween_configure_store_prize(p_campaign,p_store,p_slot,p_quantity,p_confirm)` requires staff, physical confirmation and audit; quantity cannot drop below reserved/delivered usage. Rare availability is independent of old global quantity/enabled switches, requires canonical store latch and confirmed local stock, and is exactly0.5% per available rare slot. Unknown store remains locked.

Coupon insert atomically reserves local stock with a row lock, snapshots actual won name/code/free benefit/store, and links an immutable reservation. Spin never decrements old global stock for new rare wins. Expiration, reissue and financial invalidation return that original store allocation once; redeemed coupons never return. Legacy coupons without private reservation retain their original global release path. Existing hardened campaign locks/financial validity checks remain intact.

Only PUBLIC `halloween_catalog.products` and ticket `campaign.products` are redacted to `{id}` slots; private staff catalog remains complete. Actual won `coupon.offer` stays real. No public margins, prices, costs, chance/stock fields or prize names appear before the result.

## Verification

- PGlite full isolated runner passes baseline coupon/payment regressions and new checkout/margin tests.
- Native PostgreSQL17 isolated localhost55439 DB `halloween_test_auto_20261024_v5` passes the same suite.
- Current `registrar_devolucao` SQL is loaded VERBATIM from 20261020123000. Actual return calls prove Halloween850 returns850 in mixed cart; other product quantity3/discount20 returns exact280; positive fee7 remains outside margin; no per-unit rounding loss in authoritative totals.
- Tests cover retry/actor-bound preflight, 699.99/700 per-store, permanent latch, partial refund cents, forged price, missing-cost pending, NULL aggregate propagation, NULL quantity-tier minimum, ACL, zero stock default, Teres/Pet snapshots, expiry/reissue/invalidation exactly once and unchanged global stock.
- Actual deterministic spin (test-local random override restored immediately) proves Teres YX-A34 offer, local reserve1, global untouched, identical repeated spin result.
- Native two-connection runner proves one sale for simultaneous retry, concurrent reconcile, forced AFTER-finalizer exception rolls back sale/payments/ledger, F9 pending then paid release, single-unit store contention with one winner, and actual runtime lock failure55P03 near3s.

Remaining limits: local finalizer is a fixture reproducing sale/items/payment/receivable behavior and positive fee semantics, not every real ERP stock/credit branch. Return and promotion spin functions themselves are real migration SQL. No production schema/catalog/cron readiness was inspected. Store names must resolve intended ERP store rows at deployment review; quantity confirmation remains a real staff action. Existing databases were preserved; local PG server remains available for review.
