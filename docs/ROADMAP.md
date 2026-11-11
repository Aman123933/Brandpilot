# BrandPilot Product Roadmap

This document outlines the strategic product direction for BrandPilot across immediate, near-term, and long-term milestones.

---

## Now (Round 3 Complete)

- **Brand Git Engine**: Complete version control system for brand rules and tone guidelines with draft/active/archived/rejected states, semantic rule diffing, and deterministic replay over all content assets.
- **Executive Insights & Analytics**: Real-time KPI dashboard with SQL-aggregated compliance rates, review turnaround velocity, top violated rules, disputed rule tracking, and outdated content risk monitoring.
- **Automated Expiry & Post-Publication Recall**: Multi-tier claim monitoring via APScheduler background jobs, startup sweeps, external secured cron endpoint (`POST /cron/expiry`), and lazy user-triggered checks.
- **Brand Passport Verification**: Cryptographically secure, shareable digital passports with public verification stamps, tamper detection, QR code generation, and formal revocation with mandatory reason tracking.
- **Hardened Authentication**: PBKDF2-HMAC-SHA256 password hashing (210,000 iterations, stdlib only), brute-force login throttling (5 failures in 10 minutes -> 429), and strict multi-tenant organization isolation (404 on cross-tenant accesses).
- **Production-Ready PostgreSQL**: Full compatibility with hosted PostgreSQL (Supabase), connection pooling (`pool_pre_ping`), automatic URL normalization, and `sslmode=require` enforcement.

---

## Next (Post-Hackathon Q1 2027)

- **Figma & Adobe Creative Cloud Integration**: Chrome extension and design plugin to perform real-time guideline checks directly inside design tools before assets are exported.
- **Slack & Microsoft Teams Notifications**: Interactive alert webhooks when assets require revalidation following fact expiration or brand guideline activation.
- **CMS Auto-Unpublish Webhooks**: Webhook triggers allowing headless CMS platforms (Contentful, Strapi, WordPress) to automatically unpublish or un-feature content whose Brand Passport transitions to `review_required` or `withdrawn`.
- **Advanced Batch Intake**: Upload entire campaigns (ZIP archives or multi-file drag & drop) with parallel batch audit processing.
- **Custom Rule Builder UI**: Visual drag-and-drop rule creator for brand managers to define custom regex, numeric constraints, and conditional claim rules without touching JSON schemas.

---

## Later (Future Vision 2027+)

- **Multi-Brand Portfolio Hierarchy**: Support for conglomerate enterprises managing multiple independent sub-brands with shared master guidelines and brand-specific overrides.
- **Automated Regulatory Compliance Feeds**: Continuous ingestion of external regulatory bodies (FTC, ASA, FDA, SEC) to automatically flag new compliance rules against live product claims.
- **Enterprise SSO & SCIM**: SAML 2.0 / OIDC enterprise authentication with Okta, Azure AD, and Google Workspace, including automated role mapping.
- **Immutable Audit Trails on Public Ledgers**: Optional anchoring of Brand Passport issuance and revocation hashes into tamper-proof public timestamp registries for high-stakes regulatory auditing.
