import requests
import os
import uuid
import base64
from dotenv import load_dotenv

load_dotenv()

# # Configuration
BASE_URL = os.getenv("LANGFUSE_HOST", "http://localhost:3000")
ORG_PUBLIC_KEY = os.getenv("LANGFUSE_ORG_PUBLIC_KEY")
ORG_SECRET_KEY = os.getenv("LANGFUSE_ORG_SECRET_KEY")


if not ORG_PUBLIC_KEY or not ORG_SECRET_KEY:
    print("Error: LANGFUSE_ORG_PUBLIC_KEY and LANGFUSE_ORG_SECRET_KEY environment variables must be set.")
    exit(1)

# Basic auth using org-scoped API key
_credentials = base64.b64encode(f"{ORG_PUBLIC_KEY}:{ORG_SECRET_KEY}".encode()).decode()
headers = {
    "Authorization": f"Basic {_credentials}",
    "Content-Type": "application/json",
}


def test_organization_apis():
    print(f"Testing Langfuse Organization Public APIs at {BASE_URL}")

    # -----------------------------------------------------------------------
    # 1. Create Project
    # -----------------------------------------------------------------------
    print("\n--- 1. Create Project (POST /api/public/projects) ---")
    project_name = f"Test Project {uuid.uuid4().hex[:6]}"
    resp = requests.post(
        f"{BASE_URL}/api/public/projects",
        headers=headers,
        json={"name": project_name, "retention": 7},
    )
    print(f"Status: {resp.status_code}")
    if resp.status_code == 201:
        project = resp.json()
        project_id = project["id"]
        print(f"Created project: {project['name']} (ID: {project_id})")
    else:
        print(f"Error: {resp.text}")
        return

    # -----------------------------------------------------------------------
    # 2. Update Project
    # -----------------------------------------------------------------------
    print(f"\n--- 2. Update Project (PUT /api/public/projects/{project_id}) ---")
    updated_name = f"{project_name} Updated"
    resp = requests.put(
        f"{BASE_URL}/api/public/projects/{project_id}",
        headers=headers,
        json={"name": updated_name},
    )
    print(f"Status: {resp.status_code}")
    if resp.status_code == 200:
        updated_project = resp.json()
        print(f"Updated project name: {updated_project['name']}")
    else:
        print(f"Error: {resp.text}")

    # -----------------------------------------------------------------------
    # 3. Create Project API Key (auto-generated)
    # -----------------------------------------------------------------------
    print(f"\n--- 3. Create Project API Key (POST /api/public/projects/{project_id}/apiKeys) ---")
    resp = requests.post(
        f"{BASE_URL}/api/public/projects/{project_id}/apiKeys",
        headers=headers,
        json={"note": "Test auto-generated key"},
    )
    print(f"Status: {resp.status_code}")
    if resp.status_code == 201:
        auto_key = resp.json()
        auto_key_id = auto_key["id"]
        print(f"Created API key ID: {auto_key_id}")
        print(f"  publicKey: {auto_key.get('publicKey')}")
    else:
        print(f"Error: {resp.text}")
        return

    # -----------------------------------------------------------------------
    # 4. Create Project API Key (predefined keys)
    # -----------------------------------------------------------------------
    print(f"\n--- 4. Create Project API Key with predefined keys (POST /api/public/projects/{project_id}/apiKeys) ---")
    predefined_public = f"pk-lf-{uuid.uuid4().hex}"
    predefined_secret = f"sk-lf-{uuid.uuid4().hex}"
    resp = requests.post(
        f"{BASE_URL}/api/public/projects/{project_id}/apiKeys",
        headers=headers,
        json={
            "note": "Test predefined key",
            "publicKey": predefined_public,
            "secretKey": predefined_secret,
        },
    )
    print(f"Status: {resp.status_code}")
    if resp.status_code == 201:
        predefined_key = resp.json()
        predefined_key_id = predefined_key["id"]
        print(f"Created predefined API key ID: {predefined_key_id}")
        print(f"  publicKey: {predefined_key.get('publicKey')}")
    else:
        print(f"Error: {resp.text}")
        predefined_key_id = None

    # -----------------------------------------------------------------------
    # 5. List Project API Keys
    # -----------------------------------------------------------------------
    print(f"\n--- 5. List Project API Keys (GET /api/public/projects/{project_id}/apiKeys) ---")
    resp = requests.get(
        f"{BASE_URL}/api/public/projects/{project_id}/apiKeys",
        headers=headers,
    )
    print(f"Status: {resp.status_code}")
    if resp.status_code == 200:
        api_keys = resp.json().get("apiKeys", [])
        print(f"Found {len(api_keys)} API key(s)")
        for k in api_keys:
            print(f"  - {k['id']} | {k.get('publicKey')} | note: {k.get('note')}")
    else:
        print(f"Error: {resp.text}")

    # -----------------------------------------------------------------------
    # 6. Delete auto-generated Project API Key
    # -----------------------------------------------------------------------
    print(f"\n--- 6. Delete Auto-generated API Key (DELETE /api/public/projects/{project_id}/apiKeys/{auto_key_id}) ---")
    resp = requests.delete(
        f"{BASE_URL}/api/public/projects/{project_id}/apiKeys/{auto_key_id}",
        headers=headers,
    )
    print(f"Status: {resp.status_code}")
    if resp.status_code == 200:
        print("Successfully deleted auto-generated API key")
    else:
        print(f"Error: {resp.text}")

    # -----------------------------------------------------------------------
    # 7. Delete predefined Project API Key (if created)
    # -----------------------------------------------------------------------
    if predefined_key_id:
        print(f"\n--- 7. Delete Predefined API Key (DELETE /api/public/projects/{project_id}/apiKeys/{predefined_key_id}) ---")
        resp = requests.delete(
            f"{BASE_URL}/api/public/projects/{project_id}/apiKeys/{predefined_key_id}",
            headers=headers,
        )
        print(f"Status: {resp.status_code}")
        if resp.status_code == 200:
            print("Successfully deleted predefined API key")
        else:
            print(f"Error: {resp.text}")

    # -----------------------------------------------------------------------
    # 8. Delete Project (async)
    # -----------------------------------------------------------------------
    # print(f"\n--- 8. Delete Project (DELETE /api/public/projects/{project_id}) ---")
    # resp = requests.delete(
    #     f"{BASE_URL}/api/public/projects/{project_id}",
    #     headers=headers,
    # )
    # print(f"Status: {resp.status_code}")
    # if resp.status_code in (200, 202):
    #     print("Project deletion enqueued / completed successfully")
    # else:
    #     print(f"Error: {resp.text}")

    print("\n--- Testing Completed ---")


if __name__ == "__main__":
    test_organization_apis()
