# Settiva

Settiva lets merchants issue invoices payable directly to their receiving accounts and provides receipts for independently verified onchain payments.

## Language

**Merchant**:
The person or business issuing an invoice and receiving its payment.
_Avoid_: Vendor, seller

**Payer**:
The person authorizing a transfer to pay an invoice. The payer does not need a Settiva account and may pay on behalf of someone else.
_Avoid_: User, customer when referring specifically to the person paying

**Invoice**:
A merchant's request for a fixed payment, with a designated asset, network, receiving account, and payment reference that remain unchanged after issuance.
_Avoid_: Transaction

**Receiving account**:
The merchant-designated account on the invoice's network that receives payment directly.
_Avoid_: Settiva account, wallet when referring to the destination account itself

**Payment reference**:
An opaque identifier unique to an invoice, included in the transfer memo to associate the transfer with that invoice. It contains no personal information.
_Avoid_: Invoice description, transaction hash

**Verified payment**:
A finalized, successful onchain transfer that Settiva independently confirms matches an invoice's required asset, network, receiving account, amount, and payment reference.
_Avoid_: Wallet approval, payment attempt

**Payment attempt**:
An effort to pay an invoice whose transfer may be awaiting confirmation, failed, mismatched, or successfully verified. An unsuccessful attempt does not prevent another attempt from satisfying the invoice.
_Avoid_: Paid invoice, verified payment before verification succeeds

**Paid invoice**:
An invoice satisfied by a matching verified payment.
_Avoid_: Pending invoice when only a payment attempt is pending

**Applied payment**:
The first matching verified payment recorded as satisfying an invoice. Later payments do not replace it.
_Avoid_: Earliest onchain transfer, since settlement order and verification order can differ

**Overpayment**:
An additional distinct, fully matching verified payment received for an invoice that already has an applied payment. In the MVP, this term covers duplicate full payments.
_Avoid_: Failed payment, repeated verification of the same transfer

**Refund**:
A separate merchant-authorized return of the full overpayment from the invoice's receiving account to the original payer, using the same asset and network. It is confirmed only after the return transfer has been independently verified.
_Avoid_: Reversal, automatic refund

**Overdue invoice**:
An unpaid invoice past its advisory due date that remains payable.
_Avoid_: Expired invoice

**Receipt**:
Evidence issued by Settiva for an invoice's applied payment, identifying the paid invoice and its onchain transfer. Later overpayments and refunds do not replace it.
_Avoid_: Wallet confirmation
