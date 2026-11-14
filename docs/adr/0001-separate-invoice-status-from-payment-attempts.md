# Separate invoice status from payment attempts

Public verification can receive failed, pending, or mismatched transfers before a valid payment arrives. Keep the invoice unpaid until a matching verified payment makes it paid; track pending confirmation and errors on individual payment attempts instead of adding pending or review-required invoice states. This prevents an invalid submission from blocking a legitimate payment and preserves the paid state when later verification requests fail.
