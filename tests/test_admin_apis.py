import requests
import os
import json
import uuid
from dotenv import load_dotenv

load_dotenv()

# Configuration
BASE_URL = os.getenv("LANGFUSE_HOST", "http://localhost:3000")
ADMIN_API_KEY = os.getenv("ADMIN_API_KEY")

if not ADMIN_API_KEY:
    print("Error: ADMIN_API_KEY environment variable is not set.")
    exit(1)

headers = {
    "Authorization": f"Bearer {ADMIN_API_KEY}",
    "Content-Type": "application/json"
}

def test_admin_apis():
    print(f"Testing Langfuse Admin APIs at {BASE_URL}")
    
    # 1. List Organizations
    print("\n--- 1. List Organizations ---")
    resp = requests.get(f"{BASE_URL}/api/admin/organizations", headers=headers)
    print(f"Status: {resp.status_code}")
    if resp.status_code == 200:
        orgs = resp.json().get("organizations", [])
        print(f"Found {len(orgs)} organizations")
    else:
        print(f"Error: {resp.text}")
        return

    # 2. Create Organization
    # print("\n--- 2. Create Organization ---")
    # org_name = f"Test Org {uuid.uuid4().hex[:6]}"
    # payload = {
    #     "name": org_name,
    #     "metadata": {"source": "python_test_script"}
    # }
    # resp = requests.post(f"{BASE_URL}/api/admin/organizations", headers=headers, json=payload)
    # print(f"Status: {resp.status_code}")
    # if resp.status_code == 201:
    #     new_org = resp.json()
    #     org_id = new_org["id"]
    #     print(f"Created organization: {new_org['name']} (ID: {org_id})")
    # else:
    #     print(f"Error: {resp.text}")
    #     return

    org_id = "cmmn7xnwh0002dgomd3dzni3k"

    # 3. Get Organization by ID
    print(f"\n--- 3. Get Organization {org_id} ---")
    resp = requests.get(f"{BASE_URL}/api/admin/organizations/{org_id}", headers=headers)
    print(f"Status: {resp.status_code}")
    if resp.status_code == 200:
        org_data = resp.json()
        print(f"Retrieved: {org_data['name']}")
    else:
        print(f"Error: {resp.text}")

    # 4. Update Organization
    print(f"\n--- 4. Update Organization {org_id} ---")
    org_name = org_data['name']
    update_payload = {
        "name": f"{org_name} Updated",
        "metadata": {"updated": True}
    }
    resp = requests.put(f"{BASE_URL}/api/admin/organizations/{org_id}", headers=headers, json=update_payload)
    print(f"Status: {resp.status_code}")
    if resp.status_code == 200:
        updated_org = resp.json()
        print(f"Updated name: {updated_org['name']}")
    else:
        print(f"Error: {resp.text}")

    # 5. Create Project in Organization
    print(f"\n--- 5. Create Project in Organization {org_id} ---")
    project_payload = {
        "name": f"Test Project {uuid.uuid4().hex[:6]}",
        "metadata": {"test": "true"}
    }
    resp = requests.post(f"{BASE_URL}/api/admin/organizations/{org_id}/projects", headers=headers, json=project_payload)
    print(f"Status: {resp.status_code}")
    if resp.status_code == 201:
        new_project = resp.json()
        print(f"Created project: {new_project['name']} (ID: {new_project['id']})")
    else:
        print(f"Error: {resp.text}")

    # 6. List Projects in Organization
    print(f"\n--- 6. List Projects in Organization {org_id} ---")
    resp = requests.get(f"{BASE_URL}/api/admin/organizations/{org_id}/projects", headers=headers)
    print(f"Status: {resp.status_code}")
    if resp.status_code == 200:
        projects = resp.json().get("projects", [])
        print(f"Found {len(projects)} projects")
    else:
        print(f"Error: {resp.text}")

    # 7. Create API Key in Organization
    print(f"\n--- 7. Create API Key in Organization {org_id} ---")
    api_key_payload = {"note": "Test API Key"}
    resp = requests.post(f"{BASE_URL}/api/admin/organizations/{org_id}/apiKeys", headers=headers, json=api_key_payload)
    print(f"Status: {resp.status_code}")
    if resp.status_code == 201:
        new_api_key = resp.json()
        api_key_id = new_api_key["id"]
        print(f"Created API key ID: {api_key_id}")
    else:
        print(f"Error: {resp.text}")
        return

    # 8. List API Keys in Organization
    print(f"\n--- 8. List API Keys in Organization {org_id} ---")
    resp = requests.get(f"{BASE_URL}/api/admin/organizations/{org_id}/apiKeys", headers=headers)
    print(f"Status: {resp.status_code}")
    if resp.status_code == 200:
        api_keys = resp.json().get("apiKeys", [])
        print(f"Found {len(api_keys)} API keys")
    else:
        print(f"Error: {resp.text}")

    # 9. Delete API Key in Organization
    print(f"\n--- 9. Delete API Key {api_key_id} in Organization {org_id} ---")
    resp = requests.delete(f"{BASE_URL}/api/admin/organizations/{org_id}/apiKeys/{api_key_id}", headers=headers)
    print(f"Status: {resp.status_code}")
    if resp.status_code == 200:
        print("Successfully deleted API key")
    else:
        print(f"Error: {resp.text}")

    # 10. Bulk Invalidate API Keys
    print("\n--- 10. Bulk Invalidate API Keys ---")
    bulk_payload = {
        "action": "invalidate",
        "projectIds": [new_project["id"]]
    }
    resp = requests.post(f"{BASE_URL}/api/admin/api-keys", headers=headers, json=bulk_payload)
    print(f"Status: {resp.status_code}")
    if resp.status_code == 200:
        print("Successfully invalidated API keys for projects")
    else:
        print(f"Error: {resp.text}")

    print("\n--- Testing Completed ---")
    print("Note: The test organization was NOT deleted because it contains a project.")
    print("Langfuse safety prevents deleting organizations with active projects.")


def test_project_deletion(project_id):
    print(f"\n--- 11. Delete Project {project_id} ---")
    resp = requests.delete(f"{BASE_URL}/api/admin/projects/{project_id}", headers=headers)
    print(f"Status: {resp.status_code}")
    if resp.status_code == 200:
        print("Successfully deleted project")
    else:
        print(f"Error: {resp.text}")

if __name__ == "__main__":
    # test_admin_apis()
    project_id = "cmmn82xqi000ddgomp069w9fz"
    test_project_deletion(project_id)
