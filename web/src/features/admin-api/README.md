# Admin API (OSS / MIT)

This feature provides **MIT-licensed**, clean-room implementations of admin endpoints for:

- Organizations
- Projects
- Memberships
- API keys

The implementation lives under `web/src/features/admin-api/server/**` and is wired into:

- Admin endpoints under `web/src/pages/api/admin/**`
- Public endpoints under `web/src/pages/api/public/**`

## Authentication

### Admin API (self-hosted only)

All `/api/admin/**` routes in this feature require:

- `Authorization: Bearer $ADMIN_API_KEY`

Where `$ADMIN_API_KEY` is configured via the server environment variable `ADMIN_API_KEY`.

By default, these routes are **blocked on Langfuse Cloud** (unless a route explicitly allows cloud access).

### Public API (organization-scoped API key)

All `/api/public/**` routes in this feature require an **organization-scoped API key** using Basic auth:

- `Authorization: Basic <base64(publicKey:secretKey)>`

Use organization-scoped keys (scope `ORGANIZATION`) for:

- Organization projects listing
- Organization memberships
- Organization API key listing
- Project creation/update/delete
- Project API key management
- Project membership management

## Routes

### Organizations (Admin)

- `GET /api/admin/organizations` — list organizations (includes projects)
- `POST /api/admin/organizations` — create an organization
- `GET /api/admin/organizations/{organizationId}` — get an organization (includes projects)
- `PUT /api/admin/organizations/{organizationId}` — update an organization
- `DELETE /api/admin/organizations/{organizationId}` — delete an organization (only if it has no projects)

### Organization API keys (Admin)

- `GET /api/admin/organizations/{organizationId}/apiKeys` — list org API keys
- `POST /api/admin/organizations/{organizationId}/apiKeys` — create org API key
- `DELETE /api/admin/organizations/{organizationId}/apiKeys/{apiKeyId}` — delete org API key

### Organization projects (Admin) — new

- `GET /api/admin/organizations/{organizationId}/projects` — list projects for organization
- `POST /api/admin/organizations/{organizationId}/projects` — create project in organization

Request body (POST) supports:

- `name` (string, required)
- `metadata` (optional JSON)
- `retention` (optional integer)
  - \(> 0\) still requires the `data-retention` entitlement (this is independent from the removed `admin-api` entitlement).

### Organizations (Public)

- `GET /api/public/organizations/projects` — list projects for the authenticated organization
- `GET /api/public/organizations/apiKeys` — list org API keys for the authenticated organization
- `GET /api/public/organizations/memberships` — list org memberships
- `PUT /api/public/organizations/memberships` — upsert org membership `{ userId, role }`
- `DELETE /api/public/organizations/memberships` — delete org membership `{ userId }`

### Projects (Public)

- `POST /api/public/projects` — create a project in the authenticated organization
- `PUT /api/public/projects/{projectId}` — update a project in the authenticated organization
- `DELETE /api/public/projects/{projectId}` — delete a project in the authenticated organization (async)

### Project API keys (Public)

- `GET /api/public/projects/{projectId}/apiKeys` — list project API keys
- `POST /api/public/projects/{projectId}/apiKeys` — create project API key
  - Supports optional predefined keys: `{ publicKey, secretKey }` (must start with `pk-lf-` / `sk-lf-`)
- `DELETE /api/public/projects/{projectId}/apiKeys/{apiKeyId}` — delete project API key

### Project memberships (Public)

- `GET /api/public/projects/{projectId}/memberships` — list project memberships
- `PUT /api/public/projects/{projectId}/memberships` — upsert project membership `{ userId, role }`
  - The user must already be a member of the organization.
- `DELETE /api/public/projects/{projectId}/memberships` — delete project membership `{ userId }`
