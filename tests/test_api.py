import os
import tempfile
import unittest

from app import app, init_db


class TaskApiTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        app.config.update(TESTING=True, DATABASE=os.path.join(self.temp_dir.name, "test.db"))
        init_db()
        self.client = app.test_client()

    def tearDown(self):
        self.temp_dir.cleanup()

    def create_task(self, **overrides):
        payload = {
            "title": "Study JavaScript",
            "description": "Review array methods",
            "deadline": "2026-10-20",
            "priority": "high",
            "status": "pending",
        }
        payload.update(overrides)
        return self.client.post("/api/tasks", json=payload)

    def test_create_and_list_task(self):
        response = self.create_task()
        self.assertEqual(response.status_code, 201)
        task = response.get_json()
        self.assertEqual(task["title"], "Study JavaScript")
        self.assertEqual(task["priority"], "high")
        listing = self.client.get("/api/tasks")
        self.assertEqual(listing.status_code, 200)
        self.assertEqual(len(listing.get_json()), 1)

    def test_rejects_blank_title(self):
        response = self.create_task(title="   ")
        self.assertEqual(response.status_code, 400)
        self.assertIn("Title is required", response.get_json()["error"])

    def test_filters_and_search(self):
        self.create_task()
        self.create_task(title="Buy groceries", status="completed", priority="low")
        pending = self.client.get("/api/tasks?status=pending").get_json()
        self.assertEqual(len(pending), 1)
        searched = self.client.get("/api/tasks?q=groceries").get_json()
        self.assertEqual(searched[0]["title"], "Buy groceries")

    def test_patch_put_and_delete(self):
        task_id = self.create_task().get_json()["id"]
        patched = self.client.patch(f"/api/tasks/{task_id}", json={"status": "completed"})
        self.assertEqual(patched.get_json()["status"], "completed")

        replaced = self.client.put(f"/api/tasks/{task_id}", json={"title": "Updated task"})
        self.assertEqual(replaced.status_code, 200)
        self.assertEqual(replaced.get_json()["title"], "Updated task")

        deleted = self.client.delete(f"/api/tasks/{task_id}")
        self.assertEqual(deleted.status_code, 200)
        self.assertEqual(self.client.get("/api/tasks").get_json(), [])

    def test_missing_task_returns_404(self):
        self.assertEqual(self.client.get("/api/tasks/999").status_code, 404)
        self.assertEqual(self.client.delete("/api/tasks/999").status_code, 404)


if __name__ == "__main__":
    unittest.main()
