import requests
import json
import uuid

# Configuration
BASE_URL = "http://localhost:3000"
ADMIN_API_KEY = "temporary-admin-api-key"
HEADERS = {
    "Authorization": f"Bearer {ADMIN_API_KEY}",
    "Content-Type": "application/json"
}
# From .env
EXISTING_USER_EMAIL = "pranjalya.tiwari@ksolves.com"

def test_admin_api():
    print("🚀 Starting Admin API Test Suite...")

    # 1. Create Organization
    org_name = f"Test Org {uuid.uuid4().hex[:6]}"
    print(f"\n--- Testing Organizations ---")
    create_org_res = requests.post(f"{BASE_URL}/api/admin/organizations", headers=HEADERS, json={"name": org_name})
    if create_org_res.status_code not in [200, 201]:
        print(f"❌ Failed to create organization ({create_org_res.status_code}): {create_org_res.text}")
        return
    org = create_org_res.json()
    org_id = org["id"]
    print(f"✅ Created Organization: {org_name} (ID: {org_id})")

    # 2. List Organizations
    list_orgs_res = requests.get(f"{BASE_URL}/api/admin/organizations", headers=HEADERS)
    if not list_orgs_res.ok:
        print(f"❌ Failed to list organizations: {list_orgs_res.text}")
    else:
        print(f"✅ Listed organizations successfully")

    # 3. Get Organization
    get_org_res = requests.get(f"{BASE_URL}/api/admin/organizations/{org_id}", headers=HEADERS)
    if not get_org_res.ok:
        print(f"❌ Failed to get organization: {get_org_res.text}")
    else:
        print(f"✅ Got Organization: {get_org_res.json()['name']}")

    # 4. Update Organization
    updated_name = f"{org_name} Updated"
    update_org_res = requests.put(f"{BASE_URL}/api/admin/organizations/{org_id}", headers=HEADERS, json={"name": updated_name})
    if not update_org_res.ok:
        print(f"❌ Failed to update organization: {update_org_res.text}")
    else:
        print(f"✅ Updated Organization name to: {updated_name}")

    # 5. Create Project
    print(f"\n--- Testing Projects ---")
    project_name = f"Test Project {uuid.uuid4().hex[:6]}"
    create_proj_res = requests.post(f"{BASE_URL}/api/admin/projects", headers=HEADERS, json={"name": project_name, "orgId": org_id})
    if create_proj_res.status_code not in [200, 201]:
        print(f"❌ Failed to create project ({create_proj_res.status_code}): {create_proj_res.text}")
        return
    project = create_proj_res.json()
    project_id = project["id"]
    print(f"✅ Created Project: {project_name} (ID: {project_id})")

    # 6. List Projects
    list_projs_res = requests.get(f"{BASE_URL}/api/admin/projects?orgId={org_id}", headers=HEADERS)
    if not list_projs_res.ok:
        print(f"❌ Failed to list projects: {list_projs_res.text}")
    else:
        print(f"✅ Listed projects successfully")

    # 7. Update Project
    update_proj_res = requests.put(f"{BASE_URL}/api/admin/projects/{project_id}", headers=HEADERS, json={"retentionDays": 45})
    if not update_proj_res.ok:
        print(f"❌ Failed to update project: {update_proj_res.text}")
    else:
        print(f"✅ Updated Project retentionDays to 45")

    # 8. Test Memberships
    print(f"\n--- Testing Memberships ---")
    # Use PUT for upserting members
    add_member_res = requests.put(f"{BASE_URL}/api/admin/organizations/{org_id}/members", headers=HEADERS, json={"email": EXISTING_USER_EMAIL, "role": "ADMIN"})
    if not add_member_res.ok:
        print(f"❌ Failed to add member ({add_member_res.status_code}): {add_member_res.text}")
    else:
        print(f"✅ Added/Updated member {EXISTING_USER_EMAIL} in organization")

    # 9. Test API Keys
    print(f"\n--- Testing API Keys ---")
    create_key_res = requests.post(f"{BASE_URL}/api/admin/organizations/{org_id}/apiKeys", headers=HEADERS, json={"note": "Test Key"})
    if create_key_res.status_code not in [200, 201]:
        print(f"❌ Failed to create API key ({create_key_res.status_code}): {create_key_res.text}")
    else:
        print(f"✅ Created Admin API Key for organization")

    print(f"\n🏁 Finished Admin API Test Suite.")

if __name__ == "__main__":
    test_admin_api()
