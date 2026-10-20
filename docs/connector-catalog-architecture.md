# Connector catalog implementation

## Existing structures and chosen abstractions

The inspected PostgreSQL database and Drizzle schema use `connector_types` for top-level categories and `connections` for user-created connections. Both tables retain their names and purposes. A nullable catalog foreign key extends existing connections without requiring historical records to have a catalog entry.

`connector_catalog` contains provider identity, its existing connector type code, display category, enabled state, adapter key, and a JSON Schema configuration document. Provider names, groupings, authentication choices, conditional fields, and configuration requirements are delivered by the API. The frontend does not contain a provider catalog or inject provider configuration defaults.

The generic configuration modal renders JSON Schema properties and explicit conditional visibility metadata. The backend validates the complete submitted configuration against the stored schema, rejects unknown fields, separates schema-marked secrets, and encrypts credentials with AES-256-GCM. Only public configuration and verification metadata appear in responses. Credentials are never returned to the browser.

Adapters implement `connect(configuration, context)` and return a verified handle containing capability metadata and a `close()` lifecycle operation. An explicit adapter registry selects implementations; an unregistered adapter fails rather than using another provider. MCP sessions remain owned by the connection service and close on disconnect, deletion, replacement, and API shutdown. Saved credentials permit explicit reconnect after a restart; no stored status is treated as proof of a new verification.

## Initial options and limits

- MCP: official TypeScript MCP SDK transports for STDIO, Streamable HTTP, and explicitly selected legacy SSE. Initialization and advertised capability discovery must succeed before persistence. HTTP transports support the authentication choices declared in their schemas. There is no automatic transport substitution. Interactive OAuth authorization-code registration is not part of this release; previously issued credentials can be supplied where declared.
- Environment adapters: local runtime/filesystem inspection, remote HTTP services, Docker-compatible daemon APIs, and a custom HTTP endpoint where each supplied schema and adapter supports it. These are backend-host environments; browser-local files and runtimes are not implied. SSH and cloud provisioning are not claimed by these adapters.
- Data and enterprise: seed all integrations requested by the product specification. Enable only providers backed by implemented verification adapters. PostgreSQL, authenticated HTTP APIs, filesystem entries, GitHub, and supported cloud/SaaS read-only API verification use real provider requests. Providers without an implemented verifier remain disabled in the catalog and cannot be created through an alternate adapter.
- STDIO is privileged backend process execution. Workspace owner/admin authorization and an operator-configured executable allowlist are required. Filesystem verification stays inside operator-configured roots. Network adapters reject URL credentials and use bounded requests without silently following redirects.

## Authentication, isolation, and extension points

The inspected authentication endpoints return user details but no verifiable session token. Login and registration will additionally issue signed, expiring bearer sessions. Catalog and connection APIs require a valid session; workspace operations also require an active membership or workspace ownership. Mutations require a privileged membership. Existing non-connector APIs keep their response shapes and routes.

Encryption keys, signing keys, request timeouts, permitted commands, filesystem roots, and session lifetimes are explicit operator configuration. Missing required configuration fails clearly. No provider credentials, endpoints, ports, selections, or transport substitutions are synthesized.

To add a provider, register its adapter, seed a catalog row with its JSON Schema and adapter key, and enable it once implemented. To add a transport, register a new SDK-backed transport adapter and catalog schema. Authentication choices belong to provider schemas and adapter implementations; unsupported choices fail validation.

## Delivery and validation status

This document was written before implementation. The catalog APIs, database-backed forms, encrypted credential storage, signed sessions, workspace authorization, verification, reconnect, disconnect, deletion, and desktop transport integration are implemented. No automated, manual, compiler, or connectivity tests were run during development, per the final user instruction. User-triggered connection verification remains required application behavior. Implemented capability does not imply integration-tested capability; provider credentials and reachable services are necessary for runtime verification.

| Capability | Initial implementation |
| --- | --- |
| Data | PostgreSQL authenticated query; REST/custom HTTP verification; SOAP service-description access only; backend-host files/folders; GitHub authenticated user verification |
| Enterprise | Azure Resource Manager, Google Cloud Resource Manager, Google Drive, Microsoft Graph, Teams, and OneDrive read-only verification using explicit provider API URLs, existing bearer tokens, and a required response-property check |
| MCP | Official `@modelcontextprotocol/sdk` v1 STDIO, Streamable HTTP, explicit legacy SSE; advertised capabilities and first-page tools/resources/prompts discovery; pagination flags identify incomplete discovery |
| Environment | Local executable and working-directory availability; remote/custom HTTP health endpoint; Docker HTTP(S) `/version` and `/info` inspection |
| Disabled catalog entries | SQL Server, MySQL, MongoDB, Cassandra, AWS: catalog records are seeded but have no implemented verifier and remain disabled |

Local runtime availability is inspection, not execution, SSH access, container creation, or cloud provisioning. HTTP verification is not a full ingestion/synchronization pipeline. MCP authentication supports schema-declared none/bearer/basic/header methods and explicit STDIO environment variables; browser OAuth authorization/refresh is not implemented. Connection configuration contains no synthesized provider URLs, ports, authentication selections, or transport fallbacks.

## Runtime configuration and operation

Both local backend `.env` files receive cryptographically generated signing/encryption keys and an explicit runtime policy. `AUTH_SESSION_TTL_SECONDS` controls session expiration; `CONNECTOR_REQUEST_TIMEOUT_MS` bounds network operations. `CONNECTOR_ALLOWED_COMMANDS` and `CONNECTOR_ALLOWED_ROOTS` are JSON arrays of absolute paths. Operators must explicitly configure these settings for deployed backends; `.env.example` leaves the values empty. Persist and back up the encryption key: changing it without migrating envelopes prevents existing credentials from being decrypted.

Sign in again after this upgrade to receive the bearer session. The desktop IPC transport forwards that session separately from its existing desktop-process token. Stored connector secrets never enter browser storage or API response DTOs. Connection statuses after a process restart are presented as disconnected until explicit reconnect verifies the provider again. Legacy connections keep their existing names, identifiers, workspace links, and metadata editing; they require catalog-based recreation to gain provider configuration.

Extensions currently mark complete top-level fields as `x-secret`; nested credential structures must mark their enclosing field as secret (as STDIO environment and argument fields do). Adding selectively secret nested properties requires extending the credential splitter before enabling that schema.

Official MCP references: https://ts.sdk.modelcontextprotocol.io/client and https://modelcontextprotocol.io/specification/2025-11-25/basic/transports.
