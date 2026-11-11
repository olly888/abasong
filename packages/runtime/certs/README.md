# Supabase database CA

Public CA downloaded on 2026-11-03 from the DevWest Dashboard's Database Settings → Download certificate:

https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt

SHA-256 certificate fingerprint: `807025AD50D4ED219D2C9C7D299C004F824EB00CF7F65AFEF607D07B72E6CAFA`.
Valid through 2031-04-26. Public certificate only; no private key.

Trust applies only to reviewed pilot PostgreSQL clients. HTTPS, AWS, local D0 and the operating system trust stores are unchanged. Retain certificate and hostname verification; replace this file through a reviewed vendor CA rotation before expiry.
